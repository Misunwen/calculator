(function () {
    'use strict';

    const pointIndexMap = {
        '高點': 0,
        '平點': 1,
        '參點': 2,
        '参點': 2
    };

    chrome.runtime.onMessage.addListener(function (message, sender, sendResponse) {
        if (!message || !message.type) {
            return;
        }

        if (message.type === 'CHECK_FIELDS') {
            sendResponse(checkFields());
            return true;
        }

        if (message.type === 'AUTO_FILL_TABLE') {
            const result = autoFillTable(message.payload);
            sendResponse(result);
            return true;
        }
    });

    function checkFields() {
        const testFields = [
            'H_P_degree[0]',
            'H_P_minute[0]',
            'H_P_second[0]',
            'H_R_degree[0]',
            'H_R_minute[0]',
            'H_R_second[0]',
            'Z_P_degree[0]',
            'Z_P_minute[0]',
            'Z_P_second[0]',
            'Z_R_degree[0]',
            'Z_R_minute[0]',
            'Z_R_second[0]'
        ];

        const missing = [];

        testFields.forEach(name => {
            const input = document.getElementsByName(name)[0];

            if (!input) {
                missing.push(name);
            }
        });

        return {
            ok: missing.length === 0,
            missing: missing
        };
    }

    function autoFillTable(payload) {
        const objects = payload.objects || [];
        const fields = payload.fields || [];
        const roundColumn = payload.roundColumn;
        const pointColumn = payload.pointColumn;
        const overwrite = payload.overwrite !== false;

        let filled = 0;
        let skipped = 0;
        let notFound = 0;
        let rowError = 0;

        objects.forEach((row, rowIndex) => {
            const roundText = row[roundColumn];
            const pointText = row[pointColumn];

            const round = parseInt(String(roundText).trim(), 10);
            const pointName = String(pointText).trim();

            const pointOffset = pointIndexMap[pointName];

            if (!round || pointOffset === undefined) {
                console.warn(`CSV 第 ${rowIndex + 2} 行：回數或照準點錯誤`, row);
                rowError++;
                return;
            }

            const inputIndex = (round - 1) * 3 + pointOffset;

            fields.forEach(field => {
                const value = row[field];

                if (value === undefined || value === null || String(value).trim() === '') {
                    skipped++;
                    return;
                }

                const inputName = `${field}[${inputIndex}]`;

                const input = document.getElementsByName(inputName)[0];

                if (!input) {
                    console.warn(`找不到網頁欄位：${inputName}`);
                    notFound++;
                    return;
                }

                if (!overwrite && String(input.value).trim() !== '') {
                    skipped++;
                    return;
                }

                setInputValue(input, value);
                filled++;
            });
        });

        return {
            filled: filled,
            skipped: skipped,
            notFound: notFound,
            rowError: rowError
        };
    }

    function setInputValue(input, value) {
        input.focus();

        input.value = String(value).trim();

        input.dispatchEvent(new Event('input', {
            bubbles: true
        }));

        input.dispatchEvent(new Event('change', {
            bubbles: true
        }));

        input.dispatchEvent(new Event('blur', {
            bubbles: true
        }));
    }
})();
