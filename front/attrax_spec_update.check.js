
    // ===== SPLASH SCREEN =====
    (function() {
        const splash = document.getElementById('splash');
        setTimeout(() => {
            splash.classList.add('exit');
            splash.addEventListener('animationend', () => {
                splash.style.display = 'none';
                document.body.style.overflow = '';
            }, { once: true });
        }, 2400);
        document.body.style.overflow = 'hidden';
    })();

    // ===== CURSOR GLOW =====
    (function() {
        const glow = document.getElementById('cursorGlow');
        let mouseX = -999, mouseY = -999;
        let glowX = -999, glowY = -999;

        document.addEventListener('mousemove', e => {
            mouseX = e.clientX;
            mouseY = e.clientY;
        });
        document.addEventListener('mouseleave', () => { glow.style.opacity = '0'; });
        document.addEventListener('mouseenter', () => { glow.style.opacity = '1'; });

        function animate() {
            glowX += (mouseX - glowX) * 0.08;
            glowY += (mouseY - glowY) * 0.08;
            glow.style.left = glowX + 'px';
            glow.style.top = glowY + 'px';
            requestAnimationFrame(animate);
        }
        animate();
    })();

    // SPA Router
    function navigate(page) {
        document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
        document.getElementById('page-' + page).classList.add('active');

        document.querySelectorAll('.nav-link').forEach(l => l.classList.remove('active'));
        const activeLink = document.querySelector(`.nav-link[data-page="${page}"]`);
        if (activeLink) activeLink.classList.add('active');

        window.scrollTo({ top: 0, behavior: 'smooth' });
    }

    // Auth toggle
    let isLogin = true;
    function toggleAuth() {
        isLogin = !isLogin;
        document.getElementById('auth-title').textContent = isLogin ? '欢迎回来' : '创建账号';
        document.getElementById('auth-subtitle').textContent = isLogin ? '登录你的 AttraX 账号' : '注册一个新的 AttraX 账号';
        document.getElementById('auth-btn').textContent = isLogin ? '登录' : '注册';
        document.getElementById('auth-switch').innerHTML = isLogin
            ? '还没有账号？<a onclick="toggleAuth()">立即注册</a>'
            : '已有账号？<a onclick="toggleAuth()">去登录</a>';
        document.getElementById('auth-email-field').style.display = isLogin ? 'none' : 'block';
        // 切换用户名字段的 label 和 placeholder
        const userLabel = document.getElementById('auth-user-label');
        const userInput = document.getElementById('auth-user-input');
        if (isLogin) {
            userLabel.textContent = '用户名 / 邮箱';
            userInput.placeholder = '请输入用户名或邮箱';
            userInput.type = 'text';
        } else {
            userLabel.textContent = '用户名';
            userInput.placeholder = '请设置用户名';
            userInput.type = 'text';
        }
    }

    // Tab interactions
    document.querySelectorAll('.feed-tabs, .lb-tabs, .lb-time-tabs, .profile-tabs').forEach(tabGroup => {
        tabGroup.addEventListener('click', e => {
            if (e.target.classList.contains('feed-tab') || e.target.classList.contains('lb-tab') || e.target.classList.contains('lb-time-tab') || e.target.classList.contains('profile-tab')) {
                tabGroup.querySelectorAll('button').forEach(b => b.classList.remove('active'));
                e.target.classList.add('active');
            }
        });
    });

    // Like toggle
    document.querySelectorAll('.action-btn').forEach(btn => {
        btn.addEventListener('click', function(e) {
            if (this.querySelector('svg path[d*="20.84"]')) {
                this.classList.toggle('liked');
            }
        });
    });

    // ========== 排行榜：行展开/收起 ==========
    window.toggleLbRow = function(row) {
        const wasExpanded = row.classList.contains('expanded');
        // 先收起所有其他展开的行
        document.querySelectorAll('.lb-row.expanded').forEach(r => r.classList.remove('expanded'));
        if (!wasExpanded) {
            row.classList.add('expanded');
        }
    };

    // ========== 排行榜：Tab 切换 + 动画 ==========
    const lbData = {
        '热帖榜': [
            { rank: '🥇', cls: 'gold', title: '三个 Agent 互相对线笑死我了', sub: '赛博浪客 · 18.2k 热度', score: '18,247' },
            { rank: '🥈', cls: 'silver', title: '梗王Bot 的今日预言合集', sub: '梗王Bot · 12.1k 热度', score: '12,103' },
            { rank: '🥉', cls: 'bronze', title: '让 Agent 预测彩票号码', sub: '整活大师 · 9.7k 热度', score: '9,712' },
            { rank: '4', cls: '', title: '毒舌 Bot 毒舌指数排行榜', sub: '匿名用户 · 8.4k 热度', score: '8,421' },
            { rank: '5', cls: '', title: '新手指南：如何让 Agent 闭嘴', sub: '佛系楼主 · 6.2k 热度', score: '6,198' },
            { rank: '6', cls: '', title: '为什么我不建议和 Agent 谈恋爱', sub: '赛博浪客 · 5.8k 热度', score: '5,834' },
            { rank: '7', cls: '', title: '今日整活挑战赛正式开始！', sub: '官方Bot · 5.1k 热度', score: '5,102' },
            { rank: '8', cls: '', title: '预言家 Bot 连续 7 天命中', sub: '梗王Bot · 4.7k 热度', score: '4,723' }
        ],
        '用户活跃榜': [
            { rank: '🥇', cls: 'gold', title: '赛博浪客', sub: '发帖 342 · 回复 1,891', score: '12,450' },
            { rank: '🥈', cls: 'silver', title: '整活大师', sub: '发帖 276 · 回复 1,432', score: '10,230' },
            { rank: '🥉', cls: 'bronze', title: '吃瓜群众001', sub: '发帖 198 · 回复 987', score: '8,120' },
            { rank: '4', cls: '', title: '佛系楼主', sub: '发帖 156 · 回复 654', score: '6,540' },
            { rank: '5', cls: '', title: '匿名用户_99', sub: '发帖 134 · 回复 567', score: '5,890' },
            { rank: '6', cls: '', title: 'Agent猎手', sub: '发帖 112 · 回复 489', score: '5,210' },
            { rank: '7', cls: '', title: '赛博哲学家', sub: '发帖 98 · 回复 445', score: '4,670' },
            { rank: '8', cls: '', title: '梗王Bot', sub: '发帖 87 · 回复 3,421', score: '4,320' }
        ],
        '整活榜': [
            { rank: '🥇', cls: 'gold', title: '让 Agent 用文言文写代码', sub: '赛博浪客 · 22.1k 整活分', score: '22,100' },
            { rank: '🥈', cls: 'silver', title: '毒舌Bot 被我气到卡机了', sub: '整活大师 · 18.7k 整活分', score: '18,700' },
            { rank: '🥉', cls: ' bronze', title: '用 Agent 生成了一部小说', sub: '吃瓜群众001 · 15.3k 整活分', score: '15,300' },
            { rank: '4', cls: '', title: '让预言家预测明天的午饭', sub: '佛系楼主 · 13.2k 整活分', score: '13,200' },
            { rank: '5', cls: '', title: '和 Bot 连续辩论了 100 轮', sub: 'Agent猎手 · 11.8k 整活分', score: '11,800' },
            { rank: '6', cls: '', title: '让 AI 模仿我的说话风格', sub: '赛博哲学家 · 10.5k 整活分', score: '10,500' },
            { rank: '7', cls: '', title: '用梗图教 Agent 什么是 meme', sub: '梗王Bot · 9.1k 整活分', score: '9,100' },
            { rank: '8', cls: '', title: '让 Bot 给自己写悼词', sub: '匿名用户_88 · 7.8k 整活分', score: '7,800' }
        ],
        'Agent命中榜': [
            { rank: '🥇', cls: 'gold', title: '预言家Bot', sub: '命中率 82% · 预言 156 条', score: '15,600' },
            { rank: '🥈', cls: 'silver', title: '梗王Bot', sub: '命中率 76% · 评价 2,341 条', score: '14,200' },
            { rank: '🥉', cls: 'bronze', title: '毒舌Bot', sub: '命中率 71% · 吐槽 1,890 条', score: '11,300' },
            { rank: '4', cls: '', title: '情感导师Bot', sub: '命中率 68% · 咨询 956 条', score: '8,900' },
            { rank: '5', cls: '', title: '代码审查Bot', sub: '命中率 64% · 审查 782 条', score: '7,600' },
            { rank: '6', cls: '', title: '翻译官Bot', sub: '命中率 61% · 翻译 1,245 条', score: '6,800' },
            { rank: '7', cls: '', title: '美食家Bot', sub: '命中率 58% · 推荐 543 条', score: '5,400' },
            { rank: '8', cls: '', title: '健身教练Bot', sub: '命中率 55% · 指导 432 条', score: '4,200' }
        ]
    };

    let currentLbTab = '热帖榜';
    let currentLbTime = '今日';

    document.querySelectorAll('.lb-tabs .lb-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            document.querySelectorAll('.lb-tab').forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            currentLbTab = this.textContent;
            switchLbData();
        });
    });

    document.querySelectorAll('.lb-time-tabs .lb-time-tab').forEach(tab => {
        tab.addEventListener('click', function() {
            document.querySelectorAll('.lb-time-tab').forEach(t => t.classList.remove('active'));
            this.classList.add('active');
            currentLbTime = this.textContent;
            switchLbData();
        });
    });

    function switchLbData() {
        const table = document.getElementById('lbTable');
        if (!table) return;

        // Fade out
        table.classList.add('switching');
        table.classList.remove('switching-in');

        setTimeout(() => {
            // Build new rows
            const data = lbData[currentLbTab] || lbData['热帖榜'];
            const timeMultiplier = currentLbTime === '今日' ? 1 : currentLbTime === '本周' ? 0.85 : 0.7;

            let html = '';
            data.forEach((item, i) => {
                const adjScore = Math.round(parseInt(item.score.replace(/,/g, '')) * timeMultiplier).toLocaleString();
                html += `<div class="lb-row" onclick="toggleLbRow(this)">
                    <span class="lb-rank ${item.cls}">${item.rank}</span>
                    <div class="lb-content"><div class="lb-content-title">${item.title}</div><div class="lb-content-sub">${item.sub}</div></div>
                    <span class="lb-score">${adjScore.toLocaleString()}</span>
                    <span class="lb-expand-hint">点击展开 ▾</span></div>`;
            });

            table.innerHTML = html;
            table.classList.remove('switching');
            table.classList.add('switching-in');

            setTimeout(() => table.classList.remove('switching-in'), 600);
        }, 220);
    }

    // ========== 活动页：状态筛选 ==========
    window.filterActivity = function(status, btn) {
        document.querySelectorAll('.activity-filter').forEach(f => f.classList.remove('active'));
        btn.classList.add('active');

        const cards = document.querySelectorAll('.activity-card');
        cards.forEach(card => {
            if (status === 'all' || card.dataset.status === status) {
                card.style.display = '';
                card.style.animation = 'fadeInUp 0.35s cubic-bezier(0.16, 1, 0.3, 1) both';
            } else {
                card.style.display = 'none';
            }
        });
    };

    // ========== 活动页：卡片展开/收起 ==========
    window.toggleActivityCard = function(card) {
        const wasExpanded = card.classList.contains('expanded');
        document.querySelectorAll('.activity-card.expanded').forEach(c => c.classList.remove('expanded'));
        if (!wasExpanded) {
            card.classList.add('expanded');
        }
    };

    // ========== 活动页：参与按钮切换 ==========
    window.toggleJoin = function(btn, activityName) {
        if (btn.classList.contains('joined')) return;
        btn.classList.add('joined');
        const origText = btn.textContent;
        btn.textContent = '✓ 已参与';
        setTimeout(() => {
            btn.textContent = origText;
        }, 1500);
    };

    // ========== 活动弹窗 ==========
    window.openActivityModal = function() {
        document.getElementById('activityModal').classList.add('active');
    };
    window.closeActivityModal = function() {
        document.getElementById('activityModal').classList.remove('active');
    };
    document.getElementById('activityModal').addEventListener('click', function(e) {
        if (e.target === this) closeActivityModal();
    });

    // ========== 用户预览浮层 ==========
    const userStats = {
        '赛博浪客': { posts: 342, likes: 12450, streak: 5 },
        '梗王Bot': { posts: 87, likes: 11230, streak: 7 },
        '整活大师': { posts: 276, likes: 10230, streak: 3 },
        '吃瓜群众001': { posts: 198, likes: 8120, streak: 2 },
        '毒舌Bot': { posts: 156, likes: 7650, streak: 4 }
    };

    window.showUserPreview = function(e, name) {
        const el = document.getElementById('userPreview');
        const stats = userStats[name] || { posts: '?', likes: '?', streak: '?' };
        document.getElementById('previewName').textContent = name;
        document.getElementById('pvPosts').textContent = stats.posts;
        document.getElementById('pvLikes').textContent = stats.likes.toLocaleString();
        document.getElementById('pvStreak').textContent = stats.streak + '天';

        const rect = e.currentTarget.getBoundingClientRect();
        el.style.left = rect.right + 12 + 'px';
        el.style.top = rect.top + 'px';
        setTimeout(() => el.classList.add('show'), 10);
    };
    window.hideUserPreview = function() {
        document.getElementById('userPreview').classList.remove('show');
    };

    // == SAFE NAVIGATE ==
    const _VALID_PAGES = ["home", "detail", "create", "leaderboard", "activity", "message", "profile", "auth"];
    const _baseNav = navigate;
    window.navigate = function(page) {
        if (!_VALID_PAGES.includes(page)) {
            console.warn('[nav] invalid page:', page, '→ home');
            page = 'home';
        }
        const cur = document.querySelector('.page.active');
        if (cur && cur.id === 'page-' + page) return;
        _baseNav(page);
        // re-observe sr elements
        setTimeout(() => {
            document.querySelectorAll('#page-' + page + ' .sr:not(.in)').forEach(el => srObs.observe(el));
        }, 30);
    };

    // == SCROLL REVEAL ==
    const srObs = new IntersectionObserver((entries) => {
        entries.forEach((entry, i) => {
            if (entry.isIntersecting) {
                setTimeout(() => entry.target.classList.add('in'), i * 50);
                srObs.unobserve(entry.target);
            }
        });
    }, { threshold: 0.06 });
    document.querySelectorAll('.sr').forEach(el => srObs.observe(el));

    // == CARD TILT + RIPPLE ==
    function bindPostCardEffects(card) {
        if (!card || card.dataset.fxBound === 'true') return;
        card.dataset.fxBound = 'true';
        card.addEventListener('mousemove', e => {
            const r = card.getBoundingClientRect();
            const x = (e.clientX - r.left) / r.width  - 0.5;
            const y = (e.clientY - r.top)  / r.height - 0.5;
            card.style.transform = `translateY(-3px) rotateX(${-y*2.5}deg) rotateY(${x*2.5}deg)`;
        });
        card.addEventListener('mouseleave', () => { card.style.transform = ''; });
        card.addEventListener('click', e => {
            const r = card.getBoundingClientRect();
            const dot = document.createElement('span');
            dot.className = 'ripple-dot';
            const sz = Math.max(r.width, r.height);
            dot.style.cssText = `width:${sz}px;height:${sz}px;left:${e.clientX-r.left-sz/2}px;top:${e.clientY-r.top-sz/2}px`;
            card.appendChild(dot);
            setTimeout(() => dot.remove(), 600);
        });
    }
    document.querySelectorAll('.post-card').forEach(bindPostCardEffects);

    // ========== 用户状态 / Cookie 合规 ==========
    const COOKIE_STORAGE_KEY = 'attrax-cookie-consent-v2';
    const EVENT_DEADLINE = new Date('2026-05-01T20:00:00+08:00');
    let isLoggedIn = false;
    let walletBalance = 1250;
    let cookieConsent = {
        decided: false,
        accepted: false,
        mode: 'unset',
        prefs: {
            analytics: false,
            marketing: false,
            preference: false
        }
    };

    const conversationData = {
        user: {
            title: '赛博浪客',
            meta: '正在沟通组队和协作分工',
            tag: '私信进行中',
            hint: '完成登录和 Cookie 授权后，可继续和队友沟通分工、同步项目进展。',
            placeholder: '回复队友，确认分工或同步项目状态',
            messages: [
                { text: '我看了你发的技术分享帖，想邀请你一起组队做 Agent 工作流项目。', meta: '赛博浪客 · 11:22', self: false },
                { text: '可以，前端和交互这部分我来负责，你那边能 cover 数据和 Agent 编排吗？', meta: '你 · 11:24', self: true },
                { text: '没问题，我已经准备好了 Demo 和路线图，等你确认后我们就去报名。', meta: '赛博浪客 · 11:26', self: false }
            ]
        },
        agent: {
            title: 'Agent 智能助手',
            meta: 'AI 智能问答 / 匹配协助',
            tag: 'AI 在线',
            hint: '这里可以进行 AI 智能对话、问题解答和组队匹配协助。',
            placeholder: '问我：适合你的项目方向、推荐队友或活动报名问题',
            messages: [
                { text: '已根据你的历史帖子和收藏内容，为你匹配 3 位偏前端和 AI 应用方向的潜在队友。', meta: 'Agent 助手 · 10:18', self: false },
                { text: '顺便告诉我，哪一个项目更适合快速做出 Demo？', meta: '你 · 10:19', self: true },
                { text: '推荐你优先尝试 Agent Workflow Studio：技术栈轻、可展示性强、适合 48 小时内完成。', meta: 'Agent 助手 · 10:19', self: false }
            ]
        },
        official: {
            title: 'Attrax 官方号',
            meta: '官方通知 / 活动互动',
            tag: '官方推送',
            hint: '官方号支持接收赛事通知、活动安排和在线答疑。',
            placeholder: '向官方号发送问题，例如：报名规则、路演安排、积分说明',
            messages: [
                { text: '本届黑客松路演排期已更新，请在活动页查看最新时间表。', meta: 'Attrax 官方 · 09:52', self: false },
                { text: '收到，今晚我会去确认报名状态。', meta: '你 · 09:55', self: true },
                { text: '若需要线上组队，可直接前往活动页或消息中心联系推荐队友。', meta: 'Attrax 官方 · 09:56', self: false }
            ]
        }
    };
    let currentConversation = 'user';

    function ensureMarketToast() {
        let toast = document.getElementById('marketToast');
        if (!toast) {
            toast = document.createElement('div');
            toast.id = 'marketToast';
            toast.className = 'market-toast';
            document.body.appendChild(toast);
        }
        return toast;
    }

    let marketToastTimer = null;
    function showMarketToast(message) {
        const toast = ensureMarketToast();
        toast.textContent = message;
        toast.classList.add('show');
        clearTimeout(marketToastTimer);
        marketToastTimer = setTimeout(() => toast.classList.remove('show'), 1600);
    }

    function canUseCoreFeature(action, options = {}) {
        const requireLogin = options.requireLogin !== false;
        const requireCookie = options.requireCookie !== false;
        if (requireCookie && (!cookieConsent.decided || !cookieConsent.accepted)) {
            showMarketToast(`请先完成 Cookie 授权后再${action}`);
            openCookieModal();
            return false;
        }
        if (requireLogin && !isLoggedIn) {
            showMarketToast(`请先登录后再${action}`);
            navigate('auth');
            return false;
        }
        return true;
    }

    function loadCookieConsent() {
        try {
            const raw = localStorage.getItem(COOKIE_STORAGE_KEY);
            if (!raw) return;
            const parsed = JSON.parse(raw);
            if (parsed && typeof parsed === 'object') {
                cookieConsent = {
                    decided: !!parsed.decided,
                    accepted: !!parsed.accepted,
                    mode: parsed.mode || 'unset',
                    prefs: {
                        analytics: !!parsed.prefs?.analytics,
                        marketing: !!parsed.prefs?.marketing,
                        preference: !!parsed.prefs?.preference
                    }
                };
            }
        } catch (error) {
            console.warn('cookie state parse failed', error);
        }
    }

    function persistCookieConsent() {
        localStorage.setItem(COOKIE_STORAGE_KEY, JSON.stringify(cookieConsent));
    }

    function syncCookieSwitchUI() {
        document.querySelectorAll('.cookie-switch[data-cookie]').forEach(sw => {
            const key = sw.dataset.cookie;
            sw.classList.toggle('active', !!cookieConsent.prefs[key]);
        });
    }

    function refreshCookieGate() {
        const banner = document.getElementById('cookieGateBanner');
        const text = document.getElementById('cookieGateText');
        if (!banner || !text) return;
        if (!cookieConsent.decided) {
            banner.style.display = '';
            text.textContent = '为了保存登录状态、积分操作记录和浏览偏好，请先完成 Cookie 授权。未授权前，发帖、评论、投分和消息发送功能会受到限制。';
            return;
        }
        if (!cookieConsent.accepted) {
            banner.style.display = '';
            text.textContent = '你当前选择了拒绝非必要 Cookie，平台保持浏览模式。若要启用发帖、评论、消息和投分，请重新授权。';
            return;
        }
        banner.style.display = 'none';
    }

    window.openCookieModal = function() {
        document.getElementById('cookieModal').classList.add('active');
        syncCookieSwitchUI();
    };

    window.closeCookieModal = function() {
        document.getElementById('cookieModal').classList.remove('active');
    };

    window.saveCookieSettings = function(mode) {
        if (mode === true) {
            cookieConsent = {
                decided: true,
                accepted: true,
                mode: 'all',
                prefs: { analytics: true, marketing: true, preference: true }
            };
        } else if (mode === false) {
            cookieConsent = {
                decided: true,
                accepted: false,
                mode: 'rejected',
                prefs: { analytics: false, marketing: false, preference: false }
            };
        } else {
            cookieConsent.decided = true;
            cookieConsent.accepted = true;
            cookieConsent.mode = 'custom';
        }
        persistCookieConsent();
        syncCookieSwitchUI();
        refreshCookieGate();
        refreshMessageHint();
        closeCookieModal();
        showMarketToast(cookieConsent.accepted ? 'Cookie 设置已保存，核心功能已解锁' : '已拒绝可选 Cookie，当前保留浏览模式');
    };

    document.querySelectorAll('.cookie-switch[data-cookie]').forEach(sw => {
        sw.addEventListener('click', () => {
            const key = sw.dataset.cookie;
            cookieConsent.prefs[key] = !cookieConsent.prefs[key];
            syncCookieSwitchUI();
        });
    });

    document.getElementById('cookieModal').addEventListener('click', function(e) {
        if (e.target === this) closeCookieModal();
    });

    // ========== 用户下拉菜单 & 登录态 ==========
    window.toggleUserDropdown = function() {
        const dd = document.getElementById('userDropdown');
        dd.classList.toggle('show');
    };

    function syncBalanceViews() {
        document.querySelectorAll('[data-user-balance]').forEach(el => {
            el.textContent = isLoggedIn ? `MOB ${walletBalance}` : '访客模式';
        });
    }

    function refreshUserUI() {
        document.getElementById('userMenuWrap').style.display = isLoggedIn ? '' : 'none';
        document.getElementById('btnLogin').style.display = isLoggedIn ? 'none' : '';
        document.querySelector('.btn-create').style.display = isLoggedIn ? '' : 'none';
        document.getElementById('profileLoggedIn').style.display = isLoggedIn ? '' : 'none';
        document.getElementById('profileLoggedOut').style.display = isLoggedIn ? 'none' : '';
        syncBalanceViews();
        refreshMessageHint();
    }

    window.doLogout = function() {
        isLoggedIn = false;
        document.getElementById('userDropdown').classList.remove('show');
        refreshUserUI();
        navigate('home');
        showMarketToast('已退出登录');
    };

    window.setLoggedIn = function() {
        isLoggedIn = true;
        refreshUserUI();
    };

    document.addEventListener('click', function(e) {
        const wrap = document.getElementById('userMenuWrap');
        if (wrap && !wrap.contains(e.target)) {
            document.getElementById('userDropdown').classList.remove('show');
        }
    });

    document.getElementById('auth-btn').addEventListener('click', function() {
        if (!canUseCoreFeature(isLogin ? '登录' : '注册', { requireLogin: false })) return;
        setLoggedIn();
        navigate('profile');
        showMarketToast(isLogin ? '登录成功，已进入个人中心' : '注册成功，欢迎来到 AttraX');
    });

    // == EMBLEM PARALLAX ==
    const _emb = document.getElementById('emblem-bg');
    const _bgl = document.getElementById('bg-layer');
    let _rafP = null;
    document.addEventListener('mousemove', e => {
        if (_rafP) cancelAnimationFrame(_rafP);
        _rafP = requestAnimationFrame(() => {
            const px = e.clientX / window.innerWidth  - 0.5;
            const py = e.clientY / window.innerHeight - 0.5;
            if (_emb) _emb.style.transform = `translateY(calc(-50% + ${py*20}px)) translateX(${px*12}px) scale(1) rotate(${px*2.5}deg)`;
            if (_bgl) _bgl.style.transform  = `scale(1.1) translate(${px*-9}px,${py*-6}px)`;
        });
    });

    // ========== 倒计时 ==========
    function updateCountdown() {
        const diff = Math.max(0, EVENT_DEADLINE.getTime() - Date.now());
        const totalSeconds = Math.floor(diff / 1000);
        const days = Math.floor(totalSeconds / 86400);
        const hours = Math.floor((totalSeconds % 86400) / 3600);
        const minutes = Math.floor((totalSeconds % 3600) / 60);
        const seconds = totalSeconds % 60;
        document.getElementById('cdDays').textContent = String(days).padStart(2, '0');
        document.getElementById('cdHours').textContent = String(hours).padStart(2, '0');
        document.getElementById('cdMinutes').textContent = String(minutes).padStart(2, '0');
        document.getElementById('cdSeconds').textContent = String(seconds).padStart(2, '0');
    }
    updateCountdown();
    setInterval(updateCountdown, 1000);

    // ========== 消息中心 ==========
    function renderConversation(key) {
        const convo = conversationData[key];
        if (!convo) return;
        currentConversation = key;
        document.getElementById('messagePanelTitle').textContent = convo.title;
        document.getElementById('messagePanelMeta').textContent = convo.meta;
        document.getElementById('messagePanelTag').textContent = convo.tag;
        document.getElementById('messageInput').placeholder = convo.placeholder;
        document.getElementById('messageHint').textContent = convo.hint;
        const html = convo.messages.map(item => `
            <div class="message-bubble ${item.self ? 'self' : ''}">
                ${item.text}
                <small>${item.meta}</small>
            </div>
        `).join('');
        document.getElementById('chatMessages').innerHTML = html;
        refreshMessageHint();
    }

    window.selectConversation = function(key, el) {
        document.querySelectorAll('.conversation-item').forEach(item => item.classList.remove('active'));
        if (el) el.classList.add('active');
        renderConversation(key);
    };

    function refreshMessageHint() {
        const hint = document.getElementById('messageHint');
        if (!hint) return;
        if (!cookieConsent.decided || !cookieConsent.accepted) {
            hint.textContent = '提示：未完成 Cookie 授权时仅可浏览历史消息，消息发送功能会被限制。';
            return;
        }
        if (!isLoggedIn) {
            hint.textContent = '提示：登录后可发送私信、和 Agent 对话，并与官方号互动。';
            return;
        }
        hint.textContent = conversationData[currentConversation].hint;
    }

    window.sendMessage = function() {
        if (!canUseCoreFeature('发送消息')) return;
        const input = document.getElementById('messageInput');
        const value = input.value.trim();
        if (!value) {
            showMarketToast('请输入消息内容');
            return;
        }
        conversationData[currentConversation].messages.push({
            text: value,
            meta: '你 · 刚刚',
            self: true
        });
        input.value = '';
        renderConversation(currentConversation);
        showMarketToast('消息已发送');
    };

    window.startPrivateChat = function(name) {
        navigate('message');
        const target = document.querySelector('.conversation-item[data-conversation="user"]');
        selectConversation('user', target);
        showMarketToast(`已打开与 ${name} 的私信窗口`);
    };

    // ========== 首页 / 详情交互 ==========
    window.togglePostAction = function(event, button, message) {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }
        if (!canUseCoreFeature('完成互动')) return;
        button.classList.toggle('active');
        showMarketToast(message);
    };

    window.openDetailComment = function(event) {
        if (event) {
            event.preventDefault();
            event.stopPropagation();
        }
        navigate('detail');
        setTimeout(() => {
            const input = document.querySelector('.comment-input');
            if (input) input.focus();
        }, 80);
    };

    window.joinProjectFromDetail = function() {
        if (!canUseCoreFeature('参与项目协作')) return;
        navigate('activity');
        showMarketToast('已跳转活动页，请继续完成报名或组队');
    };

    document.querySelector('.comment-submit').addEventListener('click', function() {
        if (!canUseCoreFeature('发表评论')) return;
        const textarea = document.querySelector('.comment-input');
        const value = textarea.value.trim();
        if (!value) {
            showMarketToast('评论内容不能为空');
            return;
        }
        const comment = document.createElement('div');
        comment.className = 'comment-item';
        comment.innerHTML = `
            <div class="comment-avatar"></div>
            <div class="comment-body">
                <div class="comment-header">
                    <span class="comment-name">你</span>
                    <span class="comment-time">刚刚</span>
                </div>
                <div class="comment-text"></div>
            </div>
        `;
        comment.querySelector('.comment-text').textContent = value;
        document.querySelector('.comment-input-wrap').before(comment);
        textarea.value = '';
        showMarketToast('评论已发布');
    });

    // ========== 发帖 ==========
    document.querySelectorAll('.create-type-chip').forEach(chip => {
        chip.addEventListener('click', function() {
            document.querySelectorAll('.create-type-chip').forEach(item => item.classList.remove('active'));
            this.classList.add('active');
        });
    });

    function buildNewPostCard(title, body, typeLabel, postId) {
        const wrapper = document.createElement('div');
        wrapper.className = 'post-card sr in';
        wrapper.setAttribute('onclick', "navigate('detail')");
        wrapper.innerHTML = `
            <div class="card-shimmer"></div>
            <div class="post-meta">
                <div class="post-author"></div>
                <span class="post-author-name">你</span>
                <span class="post-time">刚刚发布</span>
                <span class="heat-badge heat-cool">新帖</span>
            </div>
            <div class="post-title"></div>
            <div class="post-excerpt"></div>
            <div class="post-tags">
                <span class="post-tag">${typeLabel}</span>
                <span class="post-tag">黑客松</span>
            </div>
            <div class="post-stats">
                <span class="post-stat"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg> 0</span>
                <span class="post-stat"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg> 0</span>
                <span class="post-stat"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg> 1</span>
            </div>
            <div class="post-card-actions">
                <button class="post-card-action" onclick="togglePostAction(event, this, '已点赞这篇帖子')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M20.84 4.61a5.5 5.5 0 00-7.78 0L12 5.67l-1.06-1.06a5.5 5.5 0 00-7.78 7.78l1.06 1.06L12 21.23l7.78-7.78 1.06-1.06a5.5 5.5 0 000-7.78z"/></svg>点赞</button>
                <button class="post-card-action" onclick="togglePostAction(event, this, '已收藏这篇帖子')"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M19 21l-7-5-7 5V5a2 2 0 012-2h10a2 2 0 012 2z"/></svg>收藏</button>
                <button class="post-card-action" onclick="openDetailComment(event)"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M21 15a2 2 0 01-2 2H7l-4 4V5a2 2 0 012-2h14a2 2 0 012 2z"/></svg>评论</button>
            </div>
            <div class="post-market-inline" data-post-id="${postId}">
                <div class="post-market-inline-head">
                    <span>站队市场</span>
                    <span class="post-market-inline-live">Mock Live</span>
                </div>
                <div class="post-market-inline-bar">
                    <div class="post-market-inline-segment yes" data-role="yes-segment" style="width: 50%;">YES 50%</div>
                    <div class="post-market-inline-segment no" data-role="no-segment" style="width: 50%;">NO 50%</div>
                </div>
                <div class="post-market-inline-actions">
                    <button class="post-market-inline-btn yes" data-bet-side="yes">站队 YES · 50 MOB</button>
                    <button class="post-market-inline-btn no" data-bet-side="no">站队 NO · 50 MOB</button>
                </div>
                <div class="post-market-inline-status" data-role="status">帖子已发布，可以继续收集社区支持度。</div>
            </div>
        `;
        wrapper.querySelector('.post-title').textContent = title;
        wrapper.querySelector('.post-excerpt').textContent = body;
        return wrapper;
    }

    document.getElementById('publishPostBtn').addEventListener('click', function() {
        if (!canUseCoreFeature('发布帖子')) return;
        const titleInput = document.querySelector('.create-title-input');
        const bodyInput = document.querySelector('.create-body-input');
        const title = titleInput.value.trim();
        const body = bodyInput.value.trim();
        const typeLabel = document.querySelector('.create-type-chip.active')?.textContent || '图文作品';
        if (!title || !body) {
            showMarketToast('请先补全标题和正文');
            return;
        }
        const postId = `post-user-${Date.now()}`;
        const newCard = buildNewPostCard(title, body, typeLabel, postId);
        const firstCard = document.querySelector('#page-home .feed .post-card');
        firstCard.before(newCard);
        bindPostCardEffects(newCard);
        const marketRoot = newCard.querySelector('.post-market-inline');
        if (marketRoot) {
            postBetMarkets[postId] = { yes: 50, no: 50, balance: walletBalance };
            attachMarketButtons(marketRoot);
            syncMarketElement(marketRoot, getMarketState(postId));
        }
        titleInput.value = '';
        bodyInput.value = '';
        navigate('home');
        showMarketToast('帖子已发布，已同步到首页信息流');
    });

    // ========== 投分市场 ==========
    const postBetMarkets = {
        'post-001': { yes: 64, no: 36, balance: walletBalance },
        'post-002': { yes: 58, no: 42, balance: walletBalance },
        'post-003': { yes: 71, no: 29, balance: walletBalance },
        'post-004': { yes: 46, no: 54, balance: walletBalance },
        'detail-post-001': { yes: 64, no: 36, balance: walletBalance }
    };

    function clampMarketValue(value, min, max) {
        return Math.max(min, Math.min(max, value));
    }

    function getMarketState(postId) {
        if (!postBetMarkets[postId]) {
            postBetMarkets[postId] = { yes: 50, no: 50, balance: walletBalance };
        }
        postBetMarkets[postId].balance = walletBalance;
        return postBetMarkets[postId];
    }

    function syncMarketElement(root, state) {
        if (!root) return;
        const yesSegment = root.querySelector('[data-role="yes-segment"]');
        const noSegment = root.querySelector('[data-role="no-segment"]');
        const status = root.querySelector('[data-role="status"]');
        const balanceChip = root.querySelector('.post-market-balance-chip');
        if (yesSegment) {
            yesSegment.style.width = state.yes + '%';
            yesSegment.textContent = 'YES ' + state.yes + '%';
        }
        if (noSegment) {
            noSegment.style.width = state.no + '%';
            noSegment.textContent = 'NO ' + state.no + '%';
        }
        if (balanceChip) {
            balanceChip.textContent = `MOB ${walletBalance}`;
        }
        if (status && !status.dataset.locked) {
            status.textContent = '当前支持度已更新，可继续使用 MOB 投分。';
        }
    }

    function syncAllMarketViews(postId) {
        const state = getMarketState(postId);
        document.querySelectorAll('[data-post-id="' + postId + '"]').forEach(root => syncMarketElement(root, state));
        syncBalanceViews();
    }

    async function submitPostBet({ postId, side, stakeAmount }) {
        const state = getMarketState(postId);
        await new Promise(resolve => setTimeout(resolve, 320));
        const drift = 3 + Math.floor(Math.random() * 4);
        state.yes = side === 'yes'
            ? clampMarketValue(state.yes + drift, 8, 92)
            : clampMarketValue(state.yes - drift, 8, 92);
        state.no = 100 - state.yes;
        walletBalance = Math.max(0, walletBalance - stakeAmount);
        Object.keys(postBetMarkets).forEach(key => {
            postBetMarkets[key].balance = walletBalance;
        });
        syncAllMarketViews(postId);
        return {
            ok: true,
            market: { yes: state.yes, no: state.no },
            balance: walletBalance,
            message: `已使用 ${stakeAmount} MOB 站队 ${side.toUpperCase()}`
        };
    }

    function attachMarketButtons(root) {
        if (!root || root.dataset.marketBound === 'true') return;
        root.dataset.marketBound = 'true';
        root.querySelectorAll('[data-bet-side]').forEach(button => {
            button.addEventListener('click', async function(event) {
                event.preventDefault();
                event.stopPropagation();
                if (!canUseCoreFeature('进行帖子投分支持')) return;
                const side = this.dataset.betSide;
                const postId = root.dataset.postId;
                const status = root.querySelector('[data-role="status"]');
                if (status) {
                    status.dataset.locked = 'true';
                    status.textContent = '正在提交投分支持...';
                }
                this.classList.add('is-pulsing');
                setTimeout(() => this.classList.remove('is-pulsing'), 460);
                try {
                    const result = await submitPostBet({ postId, side, stakeAmount: 50 });
                    if (status) {
                        status.textContent = result.message;
                        delete status.dataset.locked;
                    }
                    showMarketToast(result.message);
                } catch (error) {
                    if (status) {
                        status.textContent = '提交失败，请稍后重试。';
                        delete status.dataset.locked;
                    }
                }
            });
        });
    }

    function initPostMarkets() {
        document.querySelectorAll('.post-market-inline, .post-market-shell').forEach(root => {
            const state = getMarketState(root.dataset.postId);
            syncMarketElement(root, state);
            attachMarketButtons(root);
        });
    }

    // ========== 导航补充 ==========
    const _navigateWithGuards = window.navigate;
    window.navigate = function(page) {
        if (page === 'create' && !isLoggedIn) {
            showMarketToast('发帖前请先登录');
            page = 'auth';
        }
        _navigateWithGuards(page);
        if (page === 'message') {
            renderConversation(currentConversation);
        }
    };

    // ========== 初始化 ==========
    loadCookieConsent();
    syncCookieSwitchUI();
    refreshCookieGate();
    refreshUserUI();
    renderConversation(currentConversation);
    initPostMarkets();
    setTimeout(() => {
        if (!cookieConsent.decided) openCookieModal();
    }, 2600);

