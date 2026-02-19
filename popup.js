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
            'LNBTS': 'LNBTS',
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

// Поля для подсветки зеленым
const HIGHLIGHT_VALUES = {
    'MCC': '250',
    'MNC': '20'
};

const VLAN_COMBINED_COLUMNS = ['TNLSVC', 'TNL', 'ETHSVC', 'ETHIF', 'VLANIF', 'vlanid', 'userLabel'];

function hasMcc250(value) {
    if (!value) return false;
    return /\bmcc\s*[:=]\s*250\b/i.test(value) || /"mcc"\s*:\s*"?250"?/i.test(value);
}

function buildVlanSummary(row) {
    return VLAN_COMBINED_COLUMNS
        .map(col => row[col])
        .filter(Boolean)
        .join(' | ');
}

function getCellValue(sheet, row, col) {
    if (sheet === 'VLANIF' && col === 'VLAN') {
        return buildVlanSummary(row);
    }
    return row[col] || '';
}

// Загрузка данных при старте
document.addEventListener('DOMContentLoaded', function() {
    loadSearchHistory();
    preloadData();
});

function preloadData() {
    const resultsDiv = document.getElementById('results');
    resultsDiv.innerHTML = '<div class="loading">Загрузка данных...</div>';
    
    // Загружаем файл nokia_data.csv из папки расширения
    fetch(chrome.runtime.getURL('nokia_data.csv'))
        .then(response => {
            if (!response.ok) {
                throw new Error('Файл nokia_data.csv не найден');
            }
            return response.text();
        })
        .then(text => {
            parseCSV(text);
            resultsDiv.innerHTML = '<div class="no-results">Введите номер MRBTS для поиска</div>';
            document.getElementById('stats').textContent = `📊 Всего записей: ${allData.length}`;
            document.getElementById('searchBtn').disabled = false;
            
            // Показываем статистику по листам
            showSheetStats();
        })
        .catch(error => {
            console.error('Ошибка загрузки:', error);
            resultsDiv.innerHTML = `
                <div class="error">
                    ❌ Не удалось загрузить файл данных.<br>
                    Убедитесь, что файл <b>nokia_data.csv</b> находится в папке расширения.
                </div>
            `;
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
            // Очищаем значение от кавычек и лишних пробелов
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
        // Поиск по всем записям
        filteredData = allData.filter(row => {
            return row.MRBTS && row.MRBTS.toString().trim() === currentMRBTS;
        });
        
        if (filteredData.length === 0) {
            resultsDiv.innerHTML = '<div class="no-results">❌ Ничего не найдено</div>';
            document.getElementById('stats').textContent = `Поиск по MRBTS: ${currentMRBTS} - не найдено`;
            return;
        }
        
        // Горизонтальное отображение по листам
        displayHorizontalResults();
        
        document.getElementById('stats').textContent = `✅ Найдено записей: ${filteredData.length} для MRBTS: ${currentMRBTS}`;
        addToHistory(mrbtsValue);
    }, 300);
}

function checkHighlight(row, col, value) {
    // Проверяем, нужно ли подсветить значение зеленым
    if (col === 'MCC' && value === HIGHLIGHT_VALUES['MCC']) {
        return 'highlight-green';
    }
    if (col === 'MNC' && value === HIGHLIGHT_VALUES['MNC']) {
        return 'highlight-green';
    }
    
    // Проверяем вложенные поля (например, в accMmePlmnsList может быть MCC-MNC)
    if (col === 'accMmePlmnsList' && value) {
        if (hasMcc250(value)) {
            return 'highlight-green';
        }
    }
    
    return '';
}

function displayHorizontalResults() {
    // Группировка по листам
    const groupedBySheet = {};
    filteredData.forEach(row => {
        const sheet = row.source_sheet || 'Другие данные';
        if (!groupedBySheet[sheet]) {
            groupedBySheet[sheet] = [];
        }
        groupedBySheet[sheet].push(row);
    });

    let html = `
        <div class="mrbts-header">
            <h3>📡 MRBTS: ${currentMRBTS}</h3>
            <button class="copy-btn" onclick="copyAllData()">📋 Копировать всё</button>
        </div>
    `;

    // Для каждого листа создаем секцию с карточками записей
    for (const [sheet, rows] of Object.entries(groupedBySheet)) {
        const config = SHEETS_CONFIG[sheet] || {
            displayName: sheet,
            columns: {}
        };

        // Собираем все уникальные колонки для этого листа
        const allColumns = new Set();
        rows.forEach(row => {
            Object.keys(row).forEach(col => {
                if (col !== 'MRBTS' && col !== 'source_sheet' && col !== 'MRBTS_str') {
                    allColumns.add(col);
                }
            });
        });

        // Фильтруем колонки согласно конфигурации
        let displayColumns = [];
        if (Object.keys(config.columns).length > 0) {
            displayColumns = Object.keys(config.columns).filter(col => allColumns.has(col));
        } else {
            displayColumns = Array.from(allColumns);
        }

        if (sheet === 'VLANIF') {
            displayColumns = ['VLAN'];
        }

        html += `
            <div class="sheet-section">
                <div class="sheet-header">
                    <h4>📌 ${config.displayName}</h4>
                    <span class="badge">${rows.length} записей</span>
                </div>
                <div class="records-grid">
        `;

        rows.forEach((row, index) => {
            html += `
                <div class="record-card">
                    <div class="record-card-header">Запись ${index + 1}</div>
                    <table class="result-table">
            `;

            displayColumns.forEach(col => {
                let value = getCellValue(sheet, row, col);
                const highlightClass = checkHighlight(row, col, value);

                if (value.length > 160) {
                    value = value.substring(0, 160) + '...';
                }

                const displayName = col === 'VLAN' ? 'VLAN' : (config.columns[col] || col);
                const tdClass = highlightClass ? ` class="${highlightClass}"` : '';
                html += `<tr><th>${displayName}</th><td${tdClass} title="${getCellValue(sheet, row, col)}">${value || '—'}</td></tr>`;
            });

            html += `
                    </table>
                </div>
            `;
        });

        html += `
                </div>
            </div>
        `;
    }

    document.getElementById('results').innerHTML = html;
}

function copyAllData() {
    let text = `MRBTS: ${currentMRBTS}\n`;
    text += '='.repeat(50) + '\n\n';
    
    const groupedBySheet = {};
    filteredData.forEach(row => {
        const sheet = row.source_sheet || 'Другие данные';
        if (!groupedBySheet[sheet]) {
            groupedBySheet[sheet] = [];
        }
        groupedBySheet[sheet].push(row);
    });
    
    for (const [sheet, rows] of Object.entries(groupedBySheet)) {
        const config = SHEETS_CONFIG[sheet] || { displayName: sheet, columns: {} };
        text += `\n📌 ${config.displayName} (${rows.length} записей)\n`;
        text += '-'.repeat(40) + '\n';
        
        rows.forEach((row, index) => {
            if (rows.length > 1) {
                text += `\nЗапись ${index + 1}:\n`;
            }
            
            if (sheet === 'VLANIF') {
                const vlanValue = buildVlanSummary(row);
                if (vlanValue) {
                    text += `VLAN: ${vlanValue}\n`;
                }
                text += '\n';
                return;
            }

            Object.keys(row).forEach(col => {
                if (col !== 'MRBTS' && col !== 'source_sheet' && col !== 'MRBTS_str' && row[col]) {
                    const displayName = config.columns[col] || col;
                    const value = row[col];
                    
                    // Добавляем пометку о совпадении MCC/MNC
                    let marker = '';
                    if ((col === 'MCC' && value === HIGHLIGHT_VALUES['MCC']) ||
                        (col === 'MNC' && value === HIGHLIGHT_VALUES['MNC']) ||
                        (col === 'accMmePlmnsList' && value && hasMcc250(value))) {
                        marker = ' ✓';
                    }
                    
                    text += `${displayName}: ${value}${marker}\n`;
                }
            });
            text += '\n';
        });
    }
    
    navigator.clipboard.writeText(text).then(() => {
        alert('✅ Данные скопированы в буфер обмена');
    });
}

function addToHistory(mrbtsValue) {
    const normalizedValue = mrbtsValue.toString().trim();
    searchHistory = searchHistory.filter(item => item.toString() !== normalizedValue);
    searchHistory.unshift(normalizedValue);

    if (searchHistory.length > 5) {
        searchHistory = searchHistory.slice(0, 5);
    }

    saveSearchHistory();
    displayHistory();
}

function displayHistory() {
    const historyDiv = document.getElementById('history');
    if (searchHistory.length === 0) {
        historyDiv.innerHTML = '';
        return;
    }
    
    let html = '📜 История: ';
    searchHistory.forEach(value => {
        html += `<span class="history-item" onclick="document.getElementById('mrbtsInput').value='${value}'; searchMRBTS('${value}')">${value}</span>`;
    });
    historyDiv.innerHTML = html;
}

function saveSearchHistory() {
    localStorage.setItem('searchHistory', JSON.stringify(searchHistory));
}

function loadSearchHistory() {
    const saved = localStorage.getItem('searchHistory');
    if (saved) {
        searchHistory = JSON.parse(saved);
        displayHistory();
    }
}

// Добавляем обработчик Enter
document.getElementById('mrbtsInput').addEventListener('keypress', function(e) {
    if (e.key === 'Enter') {
        document.getElementById('searchBtn').click();
    }
});

document.getElementById('searchBtn').addEventListener('click', function() {
    const mrbtsValue = document.getElementById('mrbtsInput').value.trim();
    if (!mrbtsValue) {
        showTemporaryError('Введите номер MRBTS');
        return;
    }
    
    searchMRBTS(mrbtsValue);
});

function showTemporaryError(message) {
    const resultsDiv = document.getElementById('results');
    const originalContent = resultsDiv.innerHTML;
    resultsDiv.innerHTML = `<div class="error">❌ ${message}</div>`;
    setTimeout(() => {
        resultsDiv.innerHTML = originalContent;
    }, 2000);
}

// Добавляем функции в глобальную область
window.copyAllData = copyAllData;
window.searchMRBTS = searchMRBTS;
