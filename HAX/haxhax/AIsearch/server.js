require('dotenv').config();
const express = require('express');
const cors = require('cors');
const axios = require('axios');
const { GoogleGenerativeAI } = require('@google/generative-ai');

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Initialize Gemini
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

const YOUTUBE_API_KEY = process.env.YOUTUBE_API_KEY;

// Category IDs
const CATEGORY_IDS = {
    gaming: 20,
    tech: 28,
    music: 10,
    education: 27,
    comedy: 23,
    sports: 17,
    anime: 31,
    cartoon: 31,
    realistic: 19,
    all: 0
};

// Duration mapping
const DURATION_MAP = {
    short: 'short',
    medium: 'medium',
    long: 'long',
    xlong: 'long',
    all: 'any'
};

// ===== NEW: Filter out YouTube Shorts =====
function filterOutShorts(videos) {
    return videos.filter(video => {
        const isShort = 
            video.duration < 60 ||  // Less than 60 seconds
            video.title?.toLowerCase().includes('#shorts') ||
            video.description?.toLowerCase().includes('#shorts');
        
        return !isShort;
    });
}

// Parse duration
function parseDuration(duration) {
    if (!duration) return 0;
    const match = duration.match(/PT(\d+H)?(\d+M)?(\d+S)?/);
    if (!match) return 0;
    
    let minutes = 0;
    if (match[1]) minutes += parseInt(match[1]) * 60;
    if (match[2]) minutes += parseInt(match[2]);
    if (match[3]) minutes += parseInt(match[3]) / 60;
    
    return Math.round(minutes);
}

app.post('/api/search', async (req, res) => {
    try {
        const { q, categoryId, duration, subCategory } = req.body;

        if (!q) {
            return res.status(400).json({ error: 'Search query is required' });
        }

        const params = {
            part: 'snippet',
            q: q,
            type: 'video',
            maxResults: 30,  // Increased to account for filtered shorts
            order: 'relevance',
            key: YOUTUBE_API_KEY
        };

        if (categoryId && categoryId !== 0) {
            params.videoCategoryId = categoryId;
        }

        if (duration && duration !== 'any') {
            params.videoDuration = duration;
        }

        console.log('🔍 YouTube search:', params);

        const youtubeResponse = await axios.get(
            'https://www.googleapis.com/youtube/v3/search',
            { params }
        );

        const videoIds = youtubeResponse.data.items.map(item => item.id.videoId).join(',');

        if (!videoIds) {
            return res.json({
                success: true,
                query: q,
                bestVideo: null,
                allVideos: [],
                explanation: 'No videos found for this search.'
            });
        }

        // Get video stats
        const statsResponse = await axios.get(
            'https://www.googleapis.com/youtube/v3/videos',
            {
                params: {
                    part: 'statistics,snippet,contentDetails',
                    id: videoIds,
                    key: YOUTUBE_API_KEY
                }
            }
        );

        // Build video objects with stats
        const videosWithStats = await Promise.all(
            statsResponse.data.items.map(async (video) => {
                const stats = video.statistics || {};
                const snippet = video.snippet || {};
                const contentDetails = video.contentDetails || {};
                
                let comments = [];
                try {
                    const commentResponse = await axios.get(
                        'https://www.googleapis.com/youtube/v3/commentThreads',
                        {
                            params: {
                                part: 'snippet',
                                videoId: video.id,
                                maxResults: 5,
                                key: YOUTUBE_API_KEY
                            }
                        }
                    );
                    comments = commentResponse.data.items.map(item => 
                        item.snippet.topLevelComment.snippet.textDisplay
                    );
                } catch (e) {
                    // Comments disabled, ignore
                }

                return {
                    id: video.id,
                    title: snippet.title || '',
                    description: snippet.description || '',
                    thumbnail: snippet.thumbnails?.medium?.url || '',
                    channelTitle: snippet.channelTitle || '',
                    publishedAt: snippet.publishedAt || '',
                    views: parseInt(stats.viewCount) || 0,
                    likes: parseInt(stats.likeCount) || 0,
                    dislikes: parseInt(stats.dislikeCount) || 0,
                    comments: comments,
                    duration: parseDuration(contentDetails.duration)
                };
            })
        );

        // ===== NEW: Filter out shorts =====
        const filteredVideos = filterOutShorts(videosWithStats);
        console.log(`📹 Filtered out ${videosWithStats.length - filteredVideos.length} Shorts`);

        if (filteredVideos.length === 0) {
            return res.json({
                success: true,
                query: q,
                bestVideo: null,
                allVideos: [],
                explanation: 'No videos found after filtering out Shorts.'
            });
        }

        // Step 4: Gemini scoring
        const bestVideo = await getBestMatchWithGemini(q, filteredVideos, subCategory);

        res.json({
            success: true,
            query: q,
            bestVideo: bestVideo,
            allVideos: filteredVideos,
            explanation: bestVideo.explanation,
            shortsFiltered: videosWithStats.length - filteredVideos.length
        });

    } catch (error) {
        console.error('Error:', error.message);
        res.status(500).json({ 
            error: 'Something went wrong',
            details: error.message 
        });
    }
});

// Gemini scoring function
async function getBestMatchWithGemini(query, videos, subCategory) {
    if (!videos || videos.length === 0) {
        return null;
    }

    const videoList = videos.map((v, i) => {
        const likeRatio = v.likes > 0 ? Math.round((v.likes / (v.likes + v.dislikes || 1)) * 100) : 0;
        const commentsPreview = v.comments.slice(0, 3).join(' | ');
        return `${i + 1}. Title: "${v.title}"
   Channel: ${v.channelTitle}
   Views: ${v.views.toLocaleString()}
   Likes: ${v.likes.toLocaleString()} (${likeRatio}% like ratio)
   Dislikes: ${v.dislikes.toLocaleString()}
   Duration: ${v.duration} min
   Comments (sample): ${commentsPreview || 'No comments'}
   Description: ${v.description.substring(0, 200)}...`;
    }).join('\n\n');

    const subCategoryHint = subCategory ? `The user specifically wants content related to "${subCategory}".` : '';

    const prompt = `
You are an expert video curator. User searched for: "${query}"
${subCategoryHint}

Here are ${videos.length} YouTube videos (all are longer than 60 seconds, no Shorts):

${videoList}

Score each video based on these criteria (1 point each):
+1 for 90%+ like ratio (likes/(likes+dislikes) >= 0.9)
+1 for 100K+ views
+1 for positive comments (users say "great", "helpful", "amazing", "best", etc.)
+1 for 5-30 minute duration (sweet spot for tutorials)
+1 for detailed description (200+ words)
+1 for recency (uploaded within 6 months)
-1 for 10%+ dislike ratio

Also consider:
- If subCategory "${subCategory}" is mentioned in title or description, give +1 bonus
- Videos that exactly match the user's intent

Return your response in this EXACT JSON format:
{
    "bestVideoNumber": 1-${videos.length},
    "score": 8.5,
    "explanation": "Brief explanation why this video is the best match (2-3 sentences)",
    "scoreBreakdown": ["+1 for 95% like ratio", "+1 for 500K views", "+1 for positive comments"]
}

IMPORTANT: Return ONLY valid JSON, no other text.
`;

    try {
        const result = await model.generateContent(prompt);
        const response = await result.response;
        const text = response.text();
        
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error('No valid JSON found');
        }
        
        const aiResponse = JSON.parse(jsonMatch[0]);
        const videoIndex = aiResponse.bestVideoNumber - 1;
        
        let boostedVideo = videos[videoIndex];
        if (subCategory && boostedVideo) {
            const titleMatch = boostedVideo.title.toLowerCase().includes(subCategory.toLowerCase());
            const descMatch = boostedVideo.description.toLowerCase().includes(subCategory.toLowerCase());
            if (titleMatch || descMatch) {
                aiResponse.explanation += ` This video specifically mentions "${subCategory}".`;
            }
        }
        
        return {
            ...boostedVideo,
            explanation: aiResponse.explanation || 'This video matches your search well.',
            score: aiResponse.score || 0,
            scoreBreakdown: aiResponse.scoreBreakdown || []
        };
        
    } catch (error) {
        console.error('Gemini Error:', error);
        return {
            ...videos[0],
            explanation: 'YouTube\'s top result. (AI fallback)',
            score: 0,
            scoreBreakdown: []
        };
    }
}

app.listen(PORT, () => {
    console.log(`🚀 HAXHAX search running on http://localhost:${PORT}`);
    console.log(`📡 API endpoint: http://localhost:${PORT}/api/search`);
});