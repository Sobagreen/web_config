let allData = [];
let filteredData = [];
let searchHistory = [];
let currentMRBTS = '';

// Конфигурация листов и переименования столбцов
const SHEETS_CONFIG = {
    'VLANIF': {
        displayName: 'VLAN интерфейсы',
        columns: {
            'TNLSVC': 'TNL сервис',
            'TNL': 'TNL',
            'ETHSVC': 'Ethernet сервис',
            'ETHIF': 'Ethernet интерфейс',
            'VLANIF': 'VLAN интерфейс',
            'vlanid': 'VLAN ID',
            'userLabel': 'Метка'
        }
    },
    'TOPF': {
        displayName: 'Топология',
        columns: {
            'topMasterList': 'Master список'
        }
    },
    'MRBTS': {
        displayName: 'Базовая станция',
        columns: {
            'btsName': 'Имя BTS',
            'name': 'Название',
            'altitude': 'Высота',
            'latitude': 'Широта',
            'longitude': 'Долгота'
        }
    },
    'MNL_R': {
        displayName: 'ПО и версии',
        columns: {
            'activeSWReleaseVersion': 'Версия ПО',
            'activeLTERATSWVersion': 'Версия LTE'
        }
    },
    'LNMME': {
        displayName: 'MME подключения',
        columns: {
            'LNBTS': 'ИМЯ БС',
            'LNMME': 'LNMME',
            'administrativeState': 'Состояние',
            'ipAddrPrim': 'Primary IP',
            'ipAddrSec': 'Secondary IP',
            'mmeName': 'MME имя',
            's1LinkStatus': 'S1 статус',
            'transportNwId': 'Transport ID',
            'accMmePlmnsList': 'PLMN список'
        }
    },
    'LNCEL_TDD': {
        displayName: 'TDD ячейки',
        columns: {
            'LNCEL': 'LNCEL',
            'chBw': 'Ширина канала',
            'earfcn': 'EARFCN'
        }
    },
    'LNCEL_FDD': {
        displayName: 'FDD ячейки',
        columns: {
            'LNCEL': 'LNCEL',
            'LNBTS': 'LNBTS',
            'earfcnDL': 'EARFCN DL',
            'earfcnUL': 'EARFCN UL'
        }
    },
    'BBMOD_R': {
        displayName: 'Базовые модули',
        columns: {
            'EQM_R': 'EQM',
            'APEQM_R': 'APEQM',
            'CABINET_R': 'Шкаф',
            'BBMOD_R': 'BBMOD',
            'configDN': 'Config DN',
            'productCode': 'Код продукта',
            'productName': 'Название продукта',
            'serialNumber': 'Серийный номер',
            'verticalPosition': 'Позиция'
        }
    }
};

const HIGHLIGHT_VALUES = {
    'MCC': '250',
    'MNC': '20'
};

const VLAN_COMBINED_COLUMNS = ['TNLSVC', 'TNL', 'ETHSVC', 'ETHIF', 'VLANIF', 'vlanid', 'userLabel'];

function hasMcc250(value) {
    if (!value) return false;
    return /\bmcc\s*[:=]\s*250\b/i.test(value) || /"mcc"\s*:\s*"?250"?/i.test(value);
}

function splitPipeValues(value) {
    if (!value) return [];
    return value.split('|').map(item => item.trim()).filter(Boolean);
}

function stripSheetPrefix(sheet, column) {
    const prefix = `${sheet}_`;
    return column.startsWith(prefix) ? column.slice(prefix.length) : column;
}

function getDisplayLabel(config, sheet, col) {
    const baseCol = stripSheetPrefix(sheet, col);
    return config.columns[col] || config.columns[baseCol] || col;
}

function buildVlanSummary(row) {
    const compactLines = [];
    const splitValues = VLAN_COMBINED_COLUMNS.map(col => splitPipeValues(row[col] || ''));
    const maxLen = Math.max(0, ...splitValues.map(item => item.length));

    for (let i = 0; i < maxLen; i++) {
        const oneVlan = splitValues.map(values => values[i] || '').filter(Boolean).join(' • ');
        if (oneVlan) {
            compactLines.push(`VLAN${i + 1}: ${oneVlan}`);
        }
    }

    return compactLines.join(' | ');
}

function buildRmodGroups(row, columns) {
    const parsedColumns = columns.map(col => ({ col, values: splitPipeValues(row[col] || '') }));
    const maxLen = Math.max(0, ...parsedColumns.map(item => item.values.length));
    if (maxLen === 0) return [];

    const groups = [];
    for (let i = 0; i < maxLen; i++) {
        const group = {};
        parsedColumns.forEach(item => {
            group[item.col] = item.values[i] || '';
        });
        groups.push(group);
    }

    return groups;
}

function getCellValue(sheet, row, col) {
    if (sheet === 'VLANIF' && col === 'VLAN') return buildVlanSummary(row);
    return row[col] || '';
}

function getDisplayColumns(sheet, rows, config) {
    const allColumns = new Set();
    rows.forEach(row => {
        Object.keys(row).forEach(col => {
            if (col !== 'MRBTS' && col !== 'source_sheet' && col !== 'MRBTS_str') {
                allColumns.add(col);
            }
        });
    });

    if (sheet === 'VLANIF') return ['VLAN'];

    if (Object.keys(config.columns).length === 0) {
        return Array.from(allColumns);
    }

    return Array.from(allColumns).filter(col => {
        const baseCol = stripSheetPrefix(sheet, col);
        return config.columns[col] || config.columns[baseCol];
    });
}

function escapeHtml(value) {
    return String(value)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

function renderPipeList(value) {
    const items = splitPipeValues(value);
    if (items.length <= 1) {
        return escapeHtml(value || '—');
    }

    return `<ul class="value-list">${items.map(item => `<li>${escapeHtml(item)}</li>`).join('')}</ul>`;
}

function renderVerticalPosition(value) {
    const positions = splitPipeValues(value)
        .map(item => parseInt(item, 10))
        .filter(item => !Number.isNaN(item) && item >= 1 && item <= 4);

    return `
        <div class="vertical-position-box" title="${escapeHtml(value)}">
            ${[1, 2, 3, 4].map(num => `<div class="vp-segment ${positions.includes(num) ? 'active' : ''}">${num}.0</div>`).join('')}
        </div>
    `;
}

document.addEventListener('DOMContentLoaded', function() {
    preloadData();
});

function preloadData() {
    const resultsDiv = document.getElementById('results');
    resultsDiv.innerHTML = '<div class="loading">Загрузка данных...</div>';

    fetch(chrome.runtime.getURL('nokia_data.csv'))
        .then(response => {
            if (!response.ok) throw new Error('Файл nokia_data.csv не найден');
            return response.text();
        })
        .then(text => {
            parseCSV(text);
            resultsDiv.innerHTML = '<div class="no-results">Введите номер MRBTS для поиска</div>';
            document.getElementById('stats').textContent = `📊 Всего записей: ${allData.length}`;
            document.getElementById('searchBtn').disabled = false;
            showSheetStats();
            displayHistory();
        })
        .catch(error => {
            console.error('Ошибка загрузки:', error);
            resultsDiv.innerHTML = '<div class="error">❌ Не удалось загрузить файл данных.<br>Убедитесь, что файл <b>nokia_data.csv</b> находится в папке расширения.</div>';
        });
}

function showSheetStats() {
    const stats = {};
    allData.forEach(row => {
        const source = row.source_sheet || 'unknown';
        stats[source] = (stats[source] || 0) + 1;
    });

    let statsHtml = '📊 Статистика по листам:\n';
    for (const [sheet, count] of Object.entries(stats)) {
        const displayName = SHEETS_CONFIG[sheet]?.displayName || sheet;
        statsHtml += `${displayName}: ${count} записей\n`;
    }

    console.log(statsHtml);
}

function parseCSV(text) {
    const lines = text.split('\n');
    if (lines.length === 0) return;

    const headers = parseCSVLine(lines[0]);
    allData = [];

    for (let i = 1; i < lines.length; i++) {
        if (!lines[i].trim()) continue;

        const values = parseCSVLine(lines[i]);
        const row = {};

        headers.forEach((header, index) => {
            let value = values[index] || '';
            value = value.replace(/^"|"$/g, '').trim();
            row[header] = value;
        });

        allData.push(row);
    }
}

function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
        const char = line[i];
        if (char === '"') {
            inQuotes = !inQuotes;
        } else if (char === ',' && !inQuotes) {
            result.push(current);
            current = '';
        } else {
            current += char;
        }
    }

    result.push(current);
    return result;
}

function searchMRBTS(mrbtsValue) {
    const resultsDiv = document.getElementById('results');
    resultsDiv.innerHTML = '<div class="loading">Поиск...</div>';
    currentMRBTS = mrbtsValue.toString().trim();

    setTimeout(() => {
        filteredData = allData.filter(row => row.MRBTS && row.MRBTS.toString().trim() === currentMRBTS);
        if (filteredData.length === 0) {
            resultsDiv.innerHTML = '<div class="no-results">❌ Ничего не найдено</div>';
            document.getElementById('stats').textContent = `Поиск по MRBTS: ${currentMRBTS} - не найдено`;
            return;
        }

        displayHorizontalResults();
        document.getElementById('stats').textContent = `✅ Найдено записей: ${filteredData.length} для MRBTS: ${currentMRBTS}`;
        addToHistory(mrbtsValue);
    }, 300);
}

function checkHighlight(col, value) {
    if (col === 'MCC' && value === HIGHLIGHT_VALUES['MCC']) return 'highlight-green';
    if (col === 'MNC' && value === HIGHLIGHT_VALUES['MNC']) return 'highlight-green';
    if (col === 'accMmePlmnsList' && value && hasMcc250(value)) return 'highlight-green';
    return '';
}

function renderStandardRecordCard(sheet, row, index, displayColumns, config) {
    let cardHtml = `<div class="record-card"><div class="record-card-header">Запись ${index + 1}</div><table class="result-table">`;

    displayColumns.forEach(col => {
        const rawValue = getCellValue(sheet, row, col);
        const label = col === 'VLAN' ? 'VLAN' : getDisplayLabel(config, sheet, col);
        const checkCol = stripSheetPrefix(sheet, col);
        const tdClass = checkHighlight(checkCol, rawValue) ? ' class="highlight-green"' : '';

        const renderedValue = col === 'VLAN'
            ? renderPipeList(rawValue.replace(/\s\|\s/g, '|'))
            : renderPipeList(rawValue);

        cardHtml += `<tr><th>${escapeHtml(label)}</th><td${tdClass}>${renderedValue}</td></tr>`;
    });

    cardHtml += '</table></div>';
    return cardHtml;
}

function renderBbmRecordCards(rows, displayColumns, config, sheet) {
    let cardsHtml = '';
    let rmodCounter = 1;

    rows.forEach(row => {
        const rmodGroups = buildRmodGroups(row, displayColumns);
        rmodGroups.forEach(group => {
            cardsHtml += `<div class="record-card"><div class="record-card-header">RMOD${rmodCounter}</div><table class="result-table">`;
            displayColumns.forEach(col => {
                const rawValue = group[col] || '';
                const baseCol = stripSheetPrefix(sheet, col);
                const label = getDisplayLabel(config, sheet, col);
                const content = baseCol === 'verticalPosition' ? renderVerticalPosition(rawValue) : renderPipeList(rawValue);
                cardsHtml += `<tr><th>${escapeHtml(label)}</th><td>${content}</td></tr>`;
            });
            cardsHtml += '</table></div>';
            rmodCounter += 1;
        });
    });

    return cardsHtml;
}

function displayHorizontalResults() {
    const groupedBySheet = {};
    filteredData.forEach(row => {
        const sheet = row.source_sheet || 'Другие данные';
        if (!groupedBySheet[sheet]) groupedBySheet[sheet] = [];
        groupedBySheet[sheet].push(row);
    });

    let html = `<div class="mrbts-header"><h3>📡 MRBTS: ${currentMRBTS}</h3><button class="copy-btn" onclick="copyAllData()">📋 Копировать всё</button></div>`;

    for (const [sheet, rows] of Object.entries(groupedBySheet)) {
        const config = SHEETS_CONFIG[sheet] || { displayName: sheet, columns: {} };
        const displayColumns = getDisplayColumns(sheet, rows, config);

        html += `<div class="sheet-section"><div class="sheet-header"><h4>📌 ${config.displayName}</h4><span class="badge">${rows.length} записей</span></div><div class="records-grid">`;

        if (sheet === 'BBMOD_R') {
            html += renderBbmRecordCards(rows, displayColumns, config, sheet);
        } else {
            rows.forEach((row, index) => {
                html += renderStandardRecordCard(sheet, row, index, displayColumns, config);
            });
        }

        html += '</div></div>';
    }

    document.getElementById('results').innerHTML = html;
}

function copyAllData() {
    let text = `MRBTS: ${currentMRBTS}\n${'='.repeat(50)}\n\n`;
    const groupedBySheet = {};
    filteredData.forEach(row => {
        const sheet = row.source_sheet || 'Другие данные';
        if (!groupedBySheet[sheet]) groupedBySheet[sheet] = [];
        groupedBySheet[sheet].push(row);
    });

    for (const [sheet, rows] of Object.entries(groupedBySheet)) {
        const config = SHEETS_CONFIG[sheet] || { displayName: sheet, columns: {} };
        text += `\n📌 ${config.displayName} (${rows.length} записей)\n${'-'.repeat(40)}\n`;

        if (sheet === 'BBMOD_R') {
            let rmodCounter = 1;
            const displayColumns = getDisplayColumns(sheet, rows, config);
            rows.forEach(row => {
                const groups = buildRmodGroups(row, displayColumns);
                groups.forEach(group => {
                    text += `\nRMOD${rmodCounter}:\n`;
                    displayColumns.forEach(col => {
                        const value = group[col] || '';
                        if (value) text += `${getDisplayLabel(config, sheet, col)}: ${value}\n`;
                    });
                    rmodCounter += 1;
                });
            });
            continue;
        }

        rows.forEach((row, index) => {
            if (rows.length > 1) text += `\nЗапись ${index + 1}:\n`;
            const displayColumns = getDisplayColumns(sheet, [row], config);
            displayColumns.forEach(col => {
                const value = getCellValue(sheet, row, col);
                if (!value) return;
                const label = col === 'VLAN' ? 'VLAN' : getDisplayLabel(config, sheet, col);
                text += `${label}: ${splitPipeValues(value).join(', ')}\n`;
            });
        });
    }

    navigator.clipboard.writeText(text).then(() => alert('✅ Данные скопированы в буфер обмена'));
}

function addToHistory(mrbtsValue) {
    const normalizedValue = mrbtsValue.toString().trim();
    searchHistory = searchHistory.filter(item => item.toString() !== normalizedValue);
    searchHistory.unshift(normalizedValue);
    if (searchHistory.length > 5) searchHistory = searchHistory.slice(0, 5);
    displayHistory();
}

function displayHistory() {
    const historyDiv = document.getElementById('history');
    if (searchHistory.length === 0) {
        historyDiv.innerHTML = '';
        return;
    }

    historyDiv.innerHTML = `📜 История: ${searchHistory.map(value => `<button class="history-item" data-value="${value}">${value}</button>`).join('')}`;
}

document.getElementById('mrbtsInput').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') document.getElementById('searchBtn').click();
});

document.getElementById('searchBtn').addEventListener('click', function() {
    const mrbtsValue = document.getElementById('mrbtsInput').value.trim();
    if (!mrbtsValue) {
        showTemporaryError('Введите номер MRBTS');
        return;
    }
    searchMRBTS(mrbtsValue);
});

document.getElementById('history').addEventListener('click', function(event) {
    const target = event.target;
    if (!(target instanceof HTMLElement) || !target.classList.contains('history-item')) return;
    const value = target.dataset.value || '';
    if (!value) return;
    document.getElementById('mrbtsInput').value = value;
    searchMRBTS(value);
});

function showTemporaryError(message) {
    const resultsDiv = document.getElementById('results');
    const originalContent = resultsDiv.innerHTML;
    resultsDiv.innerHTML = `<div class="error">❌ ${message}</div>`;
    setTimeout(() => {
        resultsDiv.innerHTML = originalContent;
    }, 2000);
}

window.copyAllData = copyAllData;
window.searchMRBTS = searchMRBTS;
