let selectedFile = null;

const autoFields = [
    'H_P_degree',
    'H_P_minute',
    'H_P_second',
    'H_R_degree',
    'H_R_minute',
    'H_R_second',
    'Z_P_degree',
    'Z_P_minute',
    'Z_P_second',
    'Z_R_degree',
    'Z_R_minute',
    'Z_R_second'
];

document.addEventListener('DOMContentLoaded', function () {
    document.getElementById('csvFileInput').addEventListener('change', function (event) {
        selectedFile = event.target.files[0] || null;

        if (selectedFile) {
            setStatus(`已選擇檔案：${selectedFile.name}\n按「載入並全部帶入」開始填表。`);
        } else {
            setStatus('請選擇 CSV 檔案');
        }
    });

    document.getElementById('loadAndFillBtn').addEventListener('click', loadAndFill);
    document.getElementById('checkFieldsBtn').addEventListener('click', checkFields);
});

async function loadAndFill() {
    if (!selectedFile) {
        alert('請先選擇 CSV 檔案');
        return;
    }

    try {
        setStatus('正在讀取 CSV...');

        const encoding = document.getElementById('encodingSelect').value;
        const csvText = await readFileText(selectedFile, encoding);
        const rows = parseCSV(csvText);

        if (!rows || rows.length < 2) {
            throw new Error('CSV 沒有資料');
        }

        const objects = csvToObjects(rows);

        validateCsvHeaders(objects);

        const tab = await getActiveTab();

        setStatus('CSV 已讀取，正在填入網頁...');

        chrome.tabs.sendMessage(tab.id, {
            type: 'AUTO_FILL_TABLE',
            payload: {
                objects: objects,
                fields: autoFields,
                roundColumn: findColumnName(objects[0], ['回數', '測回數', 'round', 'Round']),
                pointColumn: findColumnName(objects[0], ['照準點', '點位', 'point', 'Point']),
                overwrite: true
            }
        }, function (response) {
            if (chrome.runtime.lastError) {
                alert(
                    '無法連線到目前網頁。\n\n' +
                    '請確認：\n' +
                    '1. 目前頁面是表格頁\n' +
                    '2. 安裝或更新插件後，有重新整理表格網頁\n' +
                    '3. 目前頁面不是 chrome:// 或擴充功能頁面'
                );
                setStatus('填入失敗：無法連線到目前網頁');
                return;
            }

            if (!response) {
                alert('沒有收到網頁回應');
                setStatus('填入失敗：沒有收到網頁回應');
                return;
            }

            alert(
                `填入完成\n\n` +
                `CSV 筆數：${objects.length}\n` +
                `成功填入：${response.filled}\n` +
                `略過欄位：${response.skipped}\n` +
                `找不到欄位：${response.notFound}\n` +
                `資料列錯誤：${response.rowError}`
            );

            setStatus(
                `填入完成\n` +
                `CSV 筆數：${objects.length}\n` +
                `成功填入：${response.filled}\n` +
                `略過欄位：${response.skipped}\n` +
                `找不到欄位：${response.notFound}\n` +
                `資料列錯誤：${response.rowError}`
            );
        });
    } catch (err) {
        console.error(err);
        alert('處理失敗：' + err.message);
        setStatus('處理失敗：' + err.message);
    }
}

async function checkFields() {
    try {
        const tab = await getActiveTab();

        chrome.tabs.sendMessage(tab.id, {
            type: 'CHECK_FIELDS'
        }, function (response) {
            if (chrome.runtime.lastError) {
                alert('無法檢查欄位，請重新整理目標網頁後再試。');
                return;
            }

            if (!response) {
                alert('沒有收到網頁回應');
                return;
            }

            if (response.ok) {
                alert('檢查完成：有找到表格欄位。');
            } else {
                alert(
                    '有些欄位找不到：\n\n' +
                    response.missing.join('\n')
                );
            }
        });
    } catch (err) {
        alert('檢查失敗：' + err.message);
    }
}

function validateCsvHeaders(objects) {
    if (!objects || objects.length === 0) {
        throw new Error('CSV 沒有有效資料');
    }

    const firstRow = objects[0];

    const roundColumn = findColumnName(firstRow, ['回數', '測回數', 'round', 'Round']);
    const pointColumn = findColumnName(firstRow, ['照準點', '點位', 'point', 'Point']);

    if (!roundColumn) {
        throw new Error('CSV 缺少「回數」欄位');
    }

    if (!pointColumn) {
        throw new Error('CSV 缺少「照準點」欄位');
    }

    const missing = [];

    autoFields.forEach(field => {
        if (!(field in firstRow)) {
            missing.push(field);
        }
    });

    if (missing.length > 0) {
        throw new Error(
            'CSV 缺少以下欄位：\n' +
            missing.join('\n')
        );
    }
}

function findColumnName(row, possibleNames) {
    for (const name of possibleNames) {
        if (Object.prototype.hasOwnProperty.call(row, name)) {
            return name;
        }
    }

    return '';
}

function getActiveTab() {
    return new Promise((resolve, reject) => {
        chrome.tabs.query({
            active: true,
            currentWindow: true
        }, function (tabs) {
            if (chrome.runtime.lastError) {
                reject(chrome.runtime.lastError);
                return;
            }

            if (!tabs || !tabs[0]) {
                reject(new Error('找不到目前分頁'));
                return;
            }

            resolve(tabs[0]);
        });
    });
}

function setStatus(text) {
    document.getElementById('statusText').textContent = text;
}

function readFileText(file, encoding) {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();

        reader.onload = function () {
            try {
                const buffer = reader.result;
                const decoder = new TextDecoder(encoding);
                const text = decoder.decode(buffer);
                resolve(text);
            } catch (err) {
                reject(err);
            }
        };

        reader.onerror = function () {
            reject(reader.error || new Error('檔案讀取失敗'));
        };

        reader.readAsArrayBuffer(file);
    });
}

function csvToObjects(rows) {
    const headers = rows[0].map(header => {
        return String(header)
            .replace(/^\uFEFF/, '')
            .trim();
    });

    return rows
        .slice(1)
        .filter(row => row.some(cell => String(cell).trim() !== ''))
        .map(row => {
            const obj = {};

            headers.forEach((header, index) => {
                obj[header] = row[index] !== undefined
                    ? String(row[index]).trim()
                    : '';
            });

            return obj;
        });
}

function parseCSV(text) {
    const rows = [];
    let row = [];
    let cell = '';
    let inQuotes = false;

    for (let i = 0; i < text.length; i++) {
        const char = text[i];
        const nextChar = text[i + 1];

        if (char === '"' && inQuotes && nextChar === '"') {
            cell += '"';
            i++;
        } else if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            row.push(cell);
            cell = '';
        } else if ((char === '\n' || char === '\r') && !inQuotes) {
            if (char === '\r' && nextChar === '\n') {
                i++;
            }

            row.push(cell);
            rows.push(row);

            row = [];
            cell = '';
        } else {
            cell += char;
        }
    }

    if (cell !== '' || row.length > 0) {
        row.push(cell);
        rows.push(row);
    }

    return rows;
}
