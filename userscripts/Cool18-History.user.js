// ==UserScript==
// @name         Cool18 历史年份跳转
// @namespace    cool18-history-jump
// @version      1.1.0
// @description  在 Cool18 bbs4 页面自动滚动到指定年份，无需手动一直下滑。
// @match        https://www.cool18.com/bbs4/*
// @match        http://www.cool18.com/bbs4/*
// @grant        none
// @run-at       document-end
// @downloadURL  https://raw.githubusercontent.com/hengyangnanhua/frizbee/main/userscripts/Cool18-History.user.js
// @updateURL    https://raw.githubusercontent.com/hengyangnanhua/frizbee/main/userscripts/Cool18-History.user.js
// ==/UserScript==

(() => {
    'use strict';

    const CURRENT_YEAR = new Date().getFullYear();
    let running = false;

    function normalizeYear2(yy) {
        const n = Number(yy);
        return n <= 79 ? 2000 + n : 1900 + n;
    }

    function parseDatesFromText(text) {
        const out = [];

        for (const m of text.matchAll(/\b(\d{1,2})\/(\d{1,2})\/(\d{2})\b/g)) {
            const month = Number(m[1]);
            const day = Number(m[2]);
            const year = normalizeYear2(m[3]);

            if (
                year >= 1990 &&
                year <= CURRENT_YEAR &&
                month >= 1 && month <= 12 &&
                day >= 1 && day <= 31
            ) {
                out.push({
                    year,
                    month,
                    day,
                    key: year * 10000 + month * 100 + day,
                    text: m[0]
                });
            }
        }

        return out;
    }

    function getOldestLoadedDate() {
        const dates = parseDatesFromText(document.body.innerText || '');
        if (!dates.length) return null;

        dates.sort((a, b) => a.key - b.key);
        return dates[0];
    }

    function findDateElementForYear(targetYear) {
        const walker = document.createTreeWalker(
            document.body,
            NodeFilter.SHOW_TEXT,
            {
                acceptNode(node) {
                    const text = node.nodeValue || '';
                    const matches = parseDatesFromText(text);
                    return matches.some(d => d.year === targetYear)
                        ? NodeFilter.FILTER_ACCEPT
                        : NodeFilter.FILTER_REJECT;
                }
            }
        );

        let node = walker.nextNode();

        while (node) {
            const el = node.parentElement;

            if (
                el &&
                !el.closest('#cool18-history-panel') &&
                !el.closest('#cool18-history-button')
            ) {
                return el.closest('li, article, .post-item, .t_subject, div, p, td') || el;
            }

            node = walker.nextNode();
        }

        return null;
    }

    function delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    async function waitForMoreContent(beforeHeight, beforeOldestKey) {
        const started = Date.now();

        while (Date.now() - started < 5000) {
            await delay(250);

            const height = document.documentElement.scrollHeight;
            const oldest = getOldestLoadedDate();
            const oldestKey = oldest ? oldest.key : null;

            if (
                height > beforeHeight + 50 ||
                (
                    oldestKey !== null &&
                    beforeOldestKey !== null &&
                    oldestKey < beforeOldestKey
                )
            ) {
                return true;
            }
        }

        return false;
    }

    function setStatus(text, isError = false) {
        const status = document.querySelector('#cool18-status');
        if (!status) return;

        status.textContent = text;
        status.style.color = isError ? '#ff8a80' : '#d8d8d8';
    }

    async function autoScrollToYear(targetYear) {
        if (running) return;
        running = true;

        const findButton = document.querySelector('#cool18-find');
        const stopButton = document.querySelector('#cool18-stop');

        findButton.disabled = true;
        stopButton.disabled = false;

        let noProgress = 0;
        let rounds = 0;

        try {
            while (running && rounds < 2000) {
                rounds++;

                const oldest = getOldestLoadedDate();

                if (!oldest) {
                    setStatus('当前页面没有识别到帖子日期，正在向下尝试加载…');
                } else {
                    setStatus(
                        `已加载到 ${oldest.month}/${oldest.day}/${String(oldest.year).slice(-2)}，第 ${rounds} 次加载…`
                    );

                    if (oldest.year <= targetYear) {
                        const targetEl = findDateElementForYear(targetYear);

                        if (targetEl) {
                            targetEl.scrollIntoView({
                                behavior: 'smooth',
                                block: 'center'
                            });

                            setStatus(
                                `已找到 ${targetYear} 年附近的帖子，已经帮你定位。`
                            );
                        } else {
                            setStatus(
                                `已经加载到 ${oldest.year} 年，但暂时没在页面里定位到 ${targetYear} 年日期。`
                            );
                        }

                        return;
                    }
                }

                const beforeHeight = document.documentElement.scrollHeight;
                const beforeOldestKey = oldest ? oldest.key : null;

                // 先滚到离底部稍远的位置，再到底部。
                // 某些无限滚动页面只有在“进入阈值”时才触发加载。
                window.scrollTo({
                    top: Math.max(0, beforeHeight - 500),
                    behavior: 'auto'
                });

                await delay(80);

                window.scrollTo({
                    top: document.documentElement.scrollHeight,
                    behavior: 'auto'
                });

                window.dispatchEvent(new Event('scroll'));
                document.dispatchEvent(new Event('scroll'));

                const progressed = await waitForMoreContent(
                    beforeHeight,
                    beforeOldestKey
                );

                if (progressed) {
                    noProgress = 0;
                } else {
                    noProgress++;

                    // 再轻微上移、下移一次，模拟真人触底。
                    window.scrollTo({
                        top: Math.max(
                            0,
                            document.documentElement.scrollHeight - 900
                        ),
                        behavior: 'auto'
                    });

                    await delay(250);

                    window.scrollTo({
                        top: document.documentElement.scrollHeight,
                        behavior: 'auto'
                    });

                    await delay(1200);

                    if (noProgress >= 4) {
                        const latestOldest = getOldestLoadedDate();

                        setStatus(
                            latestOldest
                                ? `连续几次没有加载出更旧内容，目前最早到 ${latestOldest.month}/${latestOldest.day}/${String(latestOldest.year).slice(-2)}。可能网站暂时停止继续加载。`
                                : '连续几次没有检测到新内容，网站的无限滚动可能没有被触发。',
                            true
                        );

                        return;
                    }
                }
            }

            if (rounds >= 2000) {
                setStatus('已经达到脚本最大加载次数，已停止。', true);
            }
        } finally {
            running = false;
            findButton.disabled = false;
            stopButton.disabled = true;
        }
    }

    const style = document.createElement('style');

    style.textContent = `
        #cool18-history-button {
            position: fixed;
            right: 16px;
            bottom: calc(20px + env(safe-area-inset-bottom));
            z-index: 2147483646;
            border: none;
            border-radius: 25px;
            background: rgba(20,20,20,.92);
            color: white;
            padding: 12px 16px;
            font-size: 16px;
            font-weight: 700;
            box-shadow: 0 4px 16px rgba(0,0,0,.35);
            -webkit-tap-highlight-color: transparent;
        }

        #cool18-history-panel {
            display: none;
            position: fixed;
            left: 12px;
            right: 12px;
            bottom: calc(80px + env(safe-area-inset-bottom));
            max-width: 520px;
            margin: auto;
            padding: 16px;
            z-index: 2147483647;
            background: rgba(25,25,25,.97);
            color: white;
            border-radius: 16px;
            box-shadow: 0 10px 30px rgba(0,0,0,.5);
            font-family: -apple-system, BlinkMacSystemFont, sans-serif;
        }

        #cool18-history-panel input {
            width: 100%;
            height: 46px;
            margin-top: 10px;
            border-radius: 10px;
            border: 1px solid #555;
            background: #111;
            color: white;
            padding: 0 12px;
            font-size: 18px;
            box-sizing: border-box;
        }

        .cool18-row {
            display: flex;
            gap: 8px;
            margin-top: 10px;
        }

        .cool18-row button {
            flex: 1;
            min-height: 44px;
            border: none;
            border-radius: 10px;
            font-size: 15px;
            font-weight: 700;
        }

        #cool18-find {
            background: white;
            color: black;
        }

        #cool18-stop,
        #cool18-close {
            background: #444;
            color: white;
        }

        #cool18-stop:disabled {
            opacity: .45;
        }

        #cool18-status {
            margin-top: 12px;
            min-height: 36px;
            font-size: 13px;
            line-height: 1.45;
            color: #d8d8d8;
        }

        #cool18-quick {
            display: grid;
            grid-template-columns: repeat(4, 1fr);
            gap: 8px;
            margin-top: 12px;
        }

        #cool18-quick button {
            border: none;
            border-radius: 8px;
            background: #333;
            color: white;
            padding: 10px 4px;
            font-size: 14px;
        }

        #cool18-note {
            margin-top: 10px;
            font-size: 12px;
            line-height: 1.45;
            color: #aaa;
        }
    `;

    document.documentElement.appendChild(style);

    const mainButton = document.createElement('button');
    mainButton.id = 'cool18-history-button';
    mainButton.textContent = '📅 历史';
    document.body.appendChild(mainButton);

    const panel = document.createElement('div');
    panel.id = 'cool18-history-panel';

    panel.innerHTML = `
        <div style="font-size:18px;font-weight:800;">
            Cool18 历史跳转
        </div>

        <input
            id="cool18-year"
            type="number"
            inputmode="numeric"
            min="1990"
            max="${CURRENT_YEAR}"
            placeholder="输入年份，例如 2020"
        >

        <div class="cool18-row">
            <button id="cool18-find">自动滚到年份</button>
            <button id="cool18-stop" disabled>停止</button>
            <button id="cool18-close">关闭</button>
        </div>

        <div id="cool18-quick"></div>

        <div id="cool18-status">
            这版不再使用无效的 tree 页码，而是自动驱动网站自己的无限滚动。
        </div>

        <div id="cool18-note">
            查很早的年份时需要连续加载较多内容；保持 Safari 在前台即可，不需要手动滑屏。
        </div>
    `;

    document.body.appendChild(panel);

    const yearInput = panel.querySelector('#cool18-year');
    const findButton = panel.querySelector('#cool18-find');
    const stopButton = panel.querySelector('#cool18-stop');
    const closeButton = panel.querySelector('#cool18-close');
    const quick = panel.querySelector('#cool18-quick');

    for (
        let year = Math.max(1990, CURRENT_YEAR - 8);
        year <= CURRENT_YEAR - 1;
        year++
    ) {
        const button = document.createElement('button');
        button.textContent = year;

        button.onclick = () => {
            yearInput.value = year;
            findButton.click();
        };

        quick.appendChild(button);
    }

    mainButton.onclick = () => {
        panel.style.display =
            panel.style.display === 'block'
                ? 'none'
                : 'block';
    };

    closeButton.onclick = () => {
        panel.style.display = 'none';
    };

    stopButton.onclick = () => {
        running = false;
        setStatus('已停止自动加载。');
    };

    findButton.onclick = async () => {
        const targetYear = Number(yearInput.value);

        if (
            !Number.isInteger(targetYear) ||
            targetYear < 1990 ||
            targetYear > CURRENT_YEAR
        ) {
            setStatus('请输入正确年份。', true);
            return;
        }

        await autoScrollToYear(targetYear);
    };
})();