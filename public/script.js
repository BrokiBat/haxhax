(function() {
    "use strict";

    // ----- DOM refs -----
    const searchInput = document.getElementById('searchInput');
    const searchBtn = document.getElementById('searchBtn');
    const loadingEl = document.getElementById('loadingIndicator');
    const resultsContainer = document.getElementById('resultsContainer');
    const errorBox = document.getElementById('errorBox');
    const errorMsg = document.getElementById('errorMessage');
    const bestIframe = document.getElementById('bestIframe');
    const explanationText = document.getElementById('explanationText');
    const channelInfo = document.getElementById('channelInfo');
    const scoreBreakdown = document.getElementById('scoreBreakdown');
    const videoGrid = document.getElementById('videoGrid');
    const resultCount = document.getElementById('resultCount');

    // ----- filter state -----
    let selectedCategory = 'all';
    let selectedSubCategory = '';

    // ----- Tutorial categories -----
    const categoryData = {
        coding: {
            sub: ['Python', 'JavaScript', 'React', 'Node.js', 'Java', 'C++', 'Rust', 'Go', 'TypeScript', 'HTML/CSS'],
            modifier: 'tutorial'
        },
        cybersecurity: {
            sub: ['Ethical Hacking', 'Penetration Testing', 'Network Security', 'Cryptography', 'CTF', 'SOC', 'Malware Analysis'],
            modifier: 'cybersecurity tutorial'
        },
        english: {
            sub: ['Grammar', 'Pronunciation', 'Vocabulary', 'IELTS', 'TOEFL', 'Business English', 'Conversation'],
            modifier: 'english lesson'
        },
        design: {
            sub: ['UI/UX', 'Figma', 'Photoshop', 'Illustrator', 'Blender', 'Sketch', 'Prototyping'],
            modifier: 'design tutorial'
        },
        datascience: {
            sub: ['Pandas', 'NumPy', 'SQL', 'Tableau', 'Power BI', 'Excel', 'Statistics'],
            modifier: 'data science tutorial'
        },
        devops: {
            sub: ['Docker', 'Kubernetes', 'AWS', 'Azure', 'Jenkins', 'Ansible', 'Terraform', 'Git'],
            modifier: 'devops tutorial'
        },
        cloud: {
            sub: ['AWS', 'Azure', 'Google Cloud', 'Cloud Architecture', 'Serverless', 'Cloud Security'],
            modifier: 'cloud computing tutorial'
        },
        aiml: {
            sub: ['Machine Learning', 'Deep Learning', 'NLP', 'Computer Vision', 'LLM', 'AI Agents', 'TensorFlow', 'PyTorch'],
            modifier: 'artificial intelligence tutorial'
        },
        softskills: {
            sub: ['Public Speaking', 'Leadership', 'Negotiation', 'Time Management', 'Interview Prep', 'Resume Writing'],
            modifier: 'soft skills tutorial'
        },
        learning: {
            sub: ['Study Skills', 'Memory Techniques', 'Speed Reading', 'Note Taking', 'Exam Prep', 'Language Learning'],
            modifier: 'how to learn'
        }
    };

    // ----- DOM refs for filters -----
    const categoryButtons = document.getElementById('categoryButtons');
    const subCategoryGroup = document.getElementById('subCategoryGroup');
    const subCategoryButtons = document.getElementById('subCategoryButtons');

    // ----- filter event listeners -----
    categoryButtons.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;

        categoryButtons.querySelectorAll('button').forEach(b => b.classList.remove('active'));
        btn.classList.add('active');

        selectedCategory = btn.dataset.category;
        selectedSubCategory = '';

        if (selectedCategory !== 'all' && categoryData[selectedCategory]) {
            subCategoryGroup.classList.add('visible');
            renderSubCategories(selectedCategory);
        } else {
            subCategoryGroup.classList.remove('visible');
        }

        performSearch();
    });

    subCategoryButtons.addEventListener('click', (e) => {
        const btn = e.target.closest('button');
        if (!btn) return;

        subCategoryButtons.querySelectorAll('button').forEach(b => b.classList.remove('sub-active'));
        btn.classList.add('sub-active');

        selectedSubCategory = btn.dataset.sub;
        performSearch();
    });

    // ----- render sub-categories -----
    function renderSubCategories(category) {
        const data = categoryData[category];
        if (!data) return;

        let html = `<button data-sub="" class="sub-active">All</button>`;
        data.sub.forEach(sub => {
            html += `<button data-sub="${sub}">${sub}</button>`;
        });
        subCategoryButtons.innerHTML = html;
    }

    // ----- build query -----
    function buildSearchQuery() {
        let query = searchInput.value.trim();

        if (!query) {
            if (selectedSubCategory) {
                query = selectedSubCategory;
            } else if (selectedCategory !== 'all' && categoryData[selectedCategory]) {
                query = categoryData[selectedCategory].modifier || selectedCategory;
            } else {
                return null;
            }
        }

        if (selectedCategory !== 'all' && categoryData[selectedCategory]) {
            const modifier = categoryData[selectedCategory].modifier;
            if (!query.toLowerCase().includes(modifier.split(' ')[0])) {
                query = `${query} ${modifier}`;
            }
        }

        return query;
    }

    // ----- core search -----
    async function performSearch() {
        const query = buildSearchQuery();

        if (!query) {
            showError('Please select a category or enter a search term.');
            return;
        }

        // Duration removed from request
        const requestBody = {
            q: query,
            categoryId: getCategoryId(selectedCategory),
            subCategory: selectedSubCategory
        };

        console.log('📤 Sending to server:', requestBody);

        setLoading(true);
        hideError();
        resultsContainer.style.display = 'none';

        try {
            const response = await fetch('/api/search', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(requestBody)
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.error || 'Server error');
            }

            renderResults(data);
            setLoading(false);
            resultsContainer.style.display = 'block';

        } catch (err) {
            console.error('Search error:', err);
            setLoading(false);
            showError(err.message || 'Could not reach the search engine.');
        }
    }

    // ----- helper: get category ID -----
    function getCategoryId(category) {
        const map = {
            coding: 28,
            cybersecurity: 28,
            english: 27,
            design: 28,
            datascience: 28,
            devops: 28,
            cloud: 28,
            aiml: 28,
            softskills: 27,
            learning: 27,
            all: 0
        };
        return map[category] || 0;
    }

    // ----- render results -----
    function renderResults(data) {
        const best = data.bestVideo;
        const all = data.allVideos || [];

        if (best && best.id) {
            bestIframe.src = `https://www.youtube.com/embed/${best.id}?autoplay=0&rel=0&modestbranding=1`;
            explanationText.textContent = best.explanation || 'Gemini selected this as the top match.';
            channelInfo.textContent = best.channelTitle ? `📺 ${best.channelTitle}` : '';

            if (best.scoreBreakdown && best.scoreBreakdown.length > 0) {
                let html = '<div style="margin-top:0.5rem;font-weight:500;">📊 Score breakdown:</div><div style="display:flex;flex-wrap:wrap;gap:0.3rem;margin-top:0.3rem;">';
                best.scoreBreakdown.forEach(item => {
                    const isPositive = item.startsWith('+');
                    const color = isPositive ? '#10b981' : '#ef4444';
                    html += `<span style="background:${isPositive ? '#ecfdf5' : '#fef2f2'};color:${color};padding:0.15rem 0.7rem;border-radius:20px;font-size:0.75rem;border:1px solid ${color}33;">${item}</span>`;
                });
                html += '</div>';
                if (best.score) {
                    html += `<div style="margin-top:0.3rem;font-weight:600;color:#1e1e2f;">⭐ Score: ${best.score}/7</div>`;
                }
                scoreBreakdown.innerHTML = html;
            } else {
                scoreBreakdown.innerHTML = '';
            }
        } else {
            if (all.length > 0) {
                const fallback = all[0];
                bestIframe.src = `https://www.youtube.com/embed/${fallback.id}?autoplay=0&rel=0&modestbranding=1`;
                explanationText.textContent = 'Showing the first result.';
                channelInfo.textContent = fallback.channelTitle ? `📺 ${fallback.channelTitle}` : '';
                scoreBreakdown.innerHTML = '';
            } else {
                bestIframe.src = '';
                explanationText.textContent = 'No videos found.';
                channelInfo.textContent = '';
                scoreBreakdown.innerHTML = '';
            }
        }

        resultCount.textContent = all.length ? `(${all.length})` : '';

        if (all.length === 0) {
            videoGrid.innerHTML = `<div style="grid-column:1/-1;padding:1.5rem;color:#6f7f92;text-align:center;">No videos found for "${data.query || ''}"</div>`;
            return;
        }

        let html = '';
        all.forEach((video, index) => {
            const isBest = (best && best.id === video.id);
            const rankLabel = isBest ? '⭐ Best' : `#${index + 1}`;
            const rankClass = isBest ? 'rank-tag best' : 'rank-tag';
            const durationText = video.duration ? `${video.duration} min` : '';
            html += `
                <div class="video-card" data-video-id="${video.id}" data-title="${video.title}">
                    <img src="${video.thumbnail || ''}" alt="${video.title}" loading="lazy" onerror="this.style.display='none'" />
                    <div class="card-body">
                        <h4>${video.title}</h4>
                        <div class="channel-name">${video.channelTitle || ''}</div>
                        <div style="display:flex;gap:0.3rem;flex-wrap:wrap;margin:0.2rem 0;">
                            <span style="font-size:0.65rem;color:#6f7f92;">👁️ ${(video.views || 0).toLocaleString()}</span>
                            <span style="font-size:0.65rem;color:#6f7f92;">👍 ${(video.likes || 0).toLocaleString()}</span>
                            ${durationText ? `<span style="font-size:0.65rem;color:#6f7f92;">⏱️ ${durationText}</span>` : ''}
                        </div>
                        <span class="${rankClass}">${rankLabel}</span>
                    </div>
                </div>
            `;
        });
        videoGrid.innerHTML = html;

        document.querySelectorAll('.video-card').forEach(card => {
            card.addEventListener('click', function() {
                const vid = this.dataset.videoId;
                if (vid) {
                    bestIframe.src = `https://www.youtube.com/embed/${vid}?autoplay=1&rel=0&modestbranding=1`;
                    const title = this.dataset.title || 'Selected video';
                    explanationText.textContent = `You selected: “${title}”`;
                    const channelEl = this.querySelector('.channel-name');
                    channelInfo.textContent = channelEl ? `📺 ${channelEl.textContent}` : '';
                    scoreBreakdown.innerHTML = '';
                    document.getElementById('bestMatch').scrollIntoView({ behavior: 'smooth', block: 'start' });
                }
            });
        });
    }

    // ----- helpers -----
    function showError(msg) {
        errorMsg.textContent = msg || 'Search failed. Please try again.';
        errorBox.style.display = 'block';
        resultsContainer.style.display = 'none';
        loadingEl.style.display = 'none';
    }

    function hideError() {
        errorBox.style.display = 'none';
    }

    function setLoading(loading) {
        loadingEl.style.display = loading ? 'block' : 'none';
        if (loading) {
            resultsContainer.style.display = 'none';
            hideError();
        }
    }

    // ----- event listeners -----
    searchBtn.addEventListener('click', performSearch);
    searchInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') {
            e.preventDefault();
            performSearch();
        }
    });

    searchInput.focus();

    window.__debug = { performSearch, buildSearchQuery };

})();