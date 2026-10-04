// ==UserScript==
// @name         Cool18 历史年份跳转
// @namespace    cool18-history-jump
// @version      1.0.0
// @description  在 Cool18 bbs4 页面增加“历史”按钮，可按年份查找旧帖子。
// @match        https://www.cool18.com/bbs4/*
// @match        http://www.cool18.com/bbs4/*
// @grant        none
// @run-at       document-end
// ==/UserScript==

(() => {
    'use strict';

    const BASE =
        'https://www.cool18.com/bbs4/index.php?app=forum&act=cachepage&cp=tree';

    const MAX_PAGE = 65536;

    function convertTwoDigitYear(y) {
        const n = Number(y);
        return n <= 79 ? 2000 + n : 1900 + n;
    }

    function extractYears(html) {
        const years = [];

        for (const match of html.matchAll(
            /\b(\d{1,2})\/(\d{1,2})\/(\d{2})\b/g
        )) {
            years.push(convertTwoDigitYear(match[3]));
        }

        for (const match of html.matchAll(
            /\b(19\d{2}|20\d{2})[-/.]\d{1,2}[-/.]\d{1,2}\b/g
        )) {
            years.push(Number(match[1]));
        }

        return years.filter(
            y => y >= 1990 && y <= new Date().getFullYear()
        );
    }

    async function getPageInfo(page) {
        const url =
            BASE +
            page +
            '&_ts=' +
            Date.now();

        const response = await fetch(url, {
            credentials: 'include',
            cache: 'no-store'
        });

        if (!response.ok) {
            throw new Error(
                `tree${page} 请求失败：HTTP ${response.status}`
            );
        }

        const html = await response.text();
        const years = extractYears(html);

        if (!years.length) {
            throw new Error(
                `tree${page} 没有识别到日期`
            );
        }

        return {
            page,
            minYear: Math.min(...years),
            maxYear: Math.max(...years)
        };
    }

    async function findYear(targetYear, updateStatus) {
        let low = 1;

        updateStatus(`正在检查 tree${low}…`);

        let info = await getPageInfo(low);

        if (
            targetYear >= info.minYear &&
            targetYear <= info.maxYear
        ) {
            return low;
        }

        if (targetYear > info.maxYear) {
            return 1;
        }

        let high = 2;

        while (high <= MAX_PAGE) {
            updateStatus(
                `寻找 ${targetYear}：检查 tree${high}…`
            );

            let current;

            try {
                current = await getPageInfo(high);
            } catch (e) {
                break;
            }

            if (
                targetYear >= current.minYear &&
                targetYear <= current.maxYear
            ) {
                return high;
            }

            if (current.maxYear < targetYear) {
                break;
            }

            low = high;
            high *= 2;

            await delay(150);
        }

        if (high > MAX_PAGE) {
            high = MAX_PAGE;
        }

        let bestPage = low;
        let bestDistance = Infinity;

        for (let i = 0; i < 25 && low <= high; i++) {
            const mid =
                Math.floor((low + high) / 2);

            updateStatus(
                `寻找 ${targetYear}：检查 tree${mid}…`
            );

            let current;

            try {
                current = await getPageInfo(mid);
            } catch (e) {
                high = mid - 1;
                continue;
            }

            if (
                targetYear >= current.minYear &&
                targetYear <= current.maxYear
            ) {
                return mid;
            }

            let distance;

            if (targetYear < current.minYear) {
                distance =
                    current.minYear - targetYear;
            } else {
                distance =
                    targetYear - current.maxYear;
            }

            if (distance < bestDistance) {
                bestDistance = distance;
                bestPage = mid;
            }

            if (current.minYear > targetYear) {
                low = mid + 1;
            } else {
                high = mid - 1;
            }

            await delay(150);
        }

        return bestPage;
    }

    function delay(ms) {
        return new Promise(
            resolve => setTimeout(resolve, ms)
        );
    }

    const style =
        document.createElement('style');

    style.textContent = `

        #cool18-history-button {
            position: fixed;
            right: 16px;
            bottom: calc(
                20px + env(safe-area-inset-bottom)
            );

            z-index: 2147483646;

            border: none;
            border-radius: 25px;

            background: rgba(20,20,20,.92);
            color: white;

            padding: 12px 16px;

            font-size: 16px;
            font-weight: 700;

            box-shadow:
                0 4px 16px rgba(0,0,0,.35);
        }


        #cool18-history-panel {

            display: none;

            position: fixed;

            left: 12px;
            right: 12px;

            bottom: calc(
                80px + env(safe-area-inset-bottom)
            );

            max-width: 520px;

            margin: auto;

            padding: 16px;

            z-index: 2147483647;

            background:
                rgba(25,25,25,.97);

            color: white;

            border-radius: 16px;

            box-shadow:
                0 10px 30px rgba(0,0,0,.5);

            font-family:
                -apple-system,
                BlinkMacSystemFont,
                sans-serif;
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


        #cool18-page {
            background: #444;
            color: white;
        }


        #cool18-close {
            background: #444;
            color: white;
        }


        #cool18-status {

            margin-top: 12px;

            min-height: 20px;

            font-size: 13px;

            color: #ccc;
        }


        #cool18-quick {

            display: grid;

            grid-template-columns:
                repeat(4, 1fr);

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
    `;

    document.documentElement.appendChild(style);

    const mainButton =
        document.createElement('button');

    mainButton.id =
        'cool18-history-button';

    mainButton.textContent =
        '📅 历史';

    document.body.appendChild(mainButton);

    const panel =
        document.createElement('div');

    panel.id =
        'cool18-history-panel';

    panel.innerHTML = `

        <div style="
            font-size:18px;
            font-weight:800;
        ">
            Cool18 历史跳转
        </div>


        <input
            id="cool18-year"
            type="number"
            inputmode="numeric"
            placeholder="输入年份，例如 2020"
        >


        <div class="cool18-row">

            <button id="cool18-find">
                按年份查找
            </button>

            <button id="cool18-page">
                直接页码
            </button>

            <button id="cool18-close">
                关闭
            </button>

        </div>


        <div id="cool18-quick"></div>


        <div id="cool18-status">
            输入年份后自动寻找历史页面
        </div>
    `;

    document.body.appendChild(panel);

    const yearInput =
        document.querySelector(
            '#cool18-year'
        );

    const findButton =
        document.querySelector(
            '#cool18-find'
        );

    const pageButton =
        document.querySelector(
            '#cool18-page'
        );

    const closeButton =
        document.querySelector(
            '#cool18-close'
        );

    const status =
        document.querySelector(
            '#cool18-status'
        );

    const quick =
        document.querySelector(
            '#cool18-quick'
        );

    const currentYear =
        new Date().getFullYear();

    for (
        let year = currentYear - 8;
        year <= currentYear - 1;
        year++
    ) {

        const button =
            document.createElement('button');

        button.textContent =
            year;

        button.onclick = () => {
            yearInput.value =
                year;

            findButton.click();
        };

        quick.appendChild(button);
    }

    mainButton.onclick = () => {

        if (
            panel.style.display ===
            'block'
        ) {

            panel.style.display =
                'none';

        } else {

            panel.style.display =
                'block';
        }
    };


    closeButton.onclick = () => {

        panel.style.display =
            'none';
    };


    pageButton.onclick = () => {

        const value =
            prompt(
                '输入历史页码，例如 500'
            );

        const page =
            Number(value);

        if (
            Number.isInteger(page) &&
            page > 0
        ) {

            location.href =
                BASE + page;
        }
    };


    findButton.onclick =
        async () => {

            const targetYear =
                Number(
                    yearInput.value
                );

            if (
                !Number.isInteger(
                    targetYear
                ) ||
                targetYear < 1990 ||
                targetYear >
                    new Date()
                        .getFullYear()
            ) {

                status.textContent =
                    '请输入正确年份';

                return;
            }


            findButton.disabled =
                true;

            pageButton.disabled =
                true;


            try {

                const page =
                    await findYear(
                        targetYear,
                        text => {
                            status.textContent =
                                text;
                        }
                    );


                status.textContent =
                    `找到接近 ${targetYear} 年的 tree${page}，正在打开…`;


                setTimeout(() => {

                    location.href =
                        BASE + page;

                }, 500);


            } catch (error) {

                status.textContent =
                    '自动查找失败：' +
                    error.message +
                    '。可以使用“直接页码”测试。';

            } finally {

                findButton.disabled =
                    false;

                pageButton.disabled =
                    false;
            }
        };

})();