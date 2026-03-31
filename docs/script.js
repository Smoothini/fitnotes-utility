let SQL;
let currentDb = null;
let originalFileArray = null;
let originalFileName = "original.db";
let lastDateInDb = new Date();

initSqlJs({ 
    locateFile: file => `https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.6.2/${file}` 
}).then(res => { SQL = res; });

document.getElementById('dbFile').addEventListener('change', async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    originalFileName = file.name;
    const buffer = await file.arrayBuffer();
    originalFileArray = new Uint8Array(buffer);
    
    // Create fresh instance
    if (currentDb) currentDb.close();
    currentDb = new SQL.Database(new Uint8Array(buffer));
    
    determineLastDate();
    showRecentEntries();
    updatePreview();
    
    // Clear input value so selecting the same file again triggers 'change'
    e.target.value = ''; 
});

function determineLastDate() {
    try {
        const res = currentDb.exec("SELECT date FROM MeasurementRecord ORDER BY date DESC LIMIT 1");
        if (res.length > 0 && res[0].values.length > 0) {
            lastDateInDb = new Date(res[0].values[0][0]);
        } else {
            lastDateInDb = new Date();
        }
    } catch (e) {
        lastDateInDb = new Date();
    }
}

function showRecentEntries() {
    if (!currentDb) return;
    try {
        const query = `
            SELECT * FROM (
                SELECT * FROM MeasurementRecord 
                ORDER BY date DESC, time DESC LIMIT 5
            ) AS recent 
            ORDER BY date ASC, time ASC`;
            
        const res = currentDb.exec(query);
        const container = document.getElementById('recentEntriesPreview');
        
        if (res.length === 0) {
            container.innerHTML = "<em>Table empty or not found.</em>";
            return;
        }

        let html = "<h3>Recent Entries (Oldest → Newest)</h3><table><tr><th>Date</th><th>Time</th><th>Value</th><th>Comment</th></tr>";
        res[0].values.forEach(row => {
            html += `<tr><td>${row[2]}</td><td>${row[3]}</td><td>${row[4]}</td><td>${row[5] || ''}</td></tr>`;
        });
        html += "</table>";
        container.innerHTML = html;
    } catch (e) {
        console.error(e);
    }
}

function updatePreview() {
    const text = document.getElementById('textInput').value.trim();
    const mode = document.getElementById('inputMode').value;
    const preview = document.getElementById('dataPreview');
    
    if (!text) {
        preview.innerHTML = "Waiting for input...";
        return;
    }

    const lines = text.split('\n').filter(l => l.trim());
    if (mode === 'auto') {
        let start = new Date(lastDateInDb);
        start.setDate(start.getDate() + 1);
        let end = new Date(start);
        end.setDate(end.getDate() + (lines.length - 1));
        
        preview.innerHTML = `<strong>Auto-Fill:</strong> ${lines.length} rows.<br>
                             <strong>Range:</strong> ${start.toISOString().split('T')[0]} to ${end.toISOString().split('T')[0]}<br>
                             <strong>Time:</strong> 09:00:00`;
    } else {
        preview.innerHTML = `<strong>Manual Mode:</strong> Processing ${lines.length} rows.`;
    }
}

// Core logic to modify the database
function addToLog(message, type = 'info') {
    const logArea = document.getElementById('logArea');
    const entry = document.createElement('div');
    entry.className = `log-${type}`;
    entry.textContent = `[${new Date().toLocaleTimeString()}] ${message}`;
    logArea.appendChild(entry);
    logArea.scrollTop = logArea.scrollHeight; // Auto-scroll to bottom
}

function applyChanges() {
    const text = document.getElementById('textInput').value.trim();
    const mode = document.getElementById('inputMode').value;
    const lines = text.split('\n').filter(l => l.trim());
    const logArea = document.getElementById('logArea');

    if (lines.length === 0) {
        addToLog("Error: No data found in text box.", "error");
        return false;
    }

    logArea.innerHTML = ''; // Clear log for new run
    addToLog(`Starting batch process (${lines.length} lines)...`);

    try {
        currentDb.run("BEGIN TRANSACTION;");
        const stmt = currentDb.prepare("INSERT INTO MeasurementRecord (measurement_id, date, time, value, comment) VALUES (?, ?, ?, ?, ?)");
        
        let autoRunDate = new Date(lastDateInDb);
        autoRunDate.setHours(12, 0, 0, 0);
        autoRunDate.setDate(autoRunDate.getDate() + 1);

        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            let finalData;

            if (mode === 'auto') {
                const parts = line.split(/[\s,\t]+/).filter(p => p);
                const val = parseFloat(parts[0]);
                if (isNaN(val)) throw new Error(`Line ${i + 1}: "${parts[0]}" is not a number.`);
                
                const comm = parts.slice(1).join(" ");
                const dateStr = autoRunDate.toISOString().split('T')[0];
                finalData = [1, dateStr, "09:00:00", val, comm];
                autoRunDate.setDate(autoRunDate.getDate() + 1);
            } else {
                // Old: const manualRegex = /^([\d\/\-]+)[, ]+([\d:]{5,8})?[, ]*([\d\.]+)[, ]*(.*)$/;
                // New (supports Tabs, Spaces, and Commas):
                const manualRegex = /^([\d\/\-]+)[\s,\t]+([\d:]{5,8})?[\s,\t]*([\d\.]+)[\s,\t]*(.*)$/;
                const match = line.match(manualRegex);

                if (!match) throw new Error(`Line ${i + 1}: Invalid manual format.`);

                let [_, rawDate, rawTime, valStr, comm] = match;
                let isoDate = rawDate;
                if (rawDate.includes('/')) {
                    const [d, m, y] = rawDate.split('/');
                    isoDate = `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
                }
                let finalTime = (rawTime || "09:00:00").split(':').length === 2 ? rawTime + ":00" : rawTime || "09:00:00";
                
                finalData = [1, isoDate, finalTime, parseFloat(valStr), comm || ""];
            }

            stmt.run(finalData);
            addToLog(`Inserted: ${finalData[1]} | ${finalData[2]} | ${finalData[3]} ${finalData[4] ? `| ${finalData[4]}` : ''}`, "success");
        }

        stmt.free();
        currentDb.run("COMMIT;");
        addToLog("Transaction committed successfully.", "info");
        return true;

    } catch (e) {
        currentDb.run("ROLLBACK;");
        addToLog(`FATAL ERROR: ${e.message}`, "error");
        addToLog("Database rolled back. No changes made.", "error");
        return false;
    }
}

async function processAndZip() {
    if (!currentDb) return alert("Upload a DB first");
    
    // Attempt the changes first
    if (applyChanges()) {
        const zip = new JSZip();
        
        // 1. Add Original DB
        zip.file(originalFileName, originalFileArray);
        
        // 2. Add Altered DB
        zip.file("ALTERED_" + originalFileName, currentDb.export());
        
        // 3. Generate log text from the UI log container
        const logContent = Array.from(document.querySelectorAll('#logArea div'))
                                .map(div => div.textContent)
                                .join('\n');
        zip.file("process_log.txt", logContent || "No log data recorded.");

        // Generate and Save ZIP
        const content = await zip.generateAsync({type: "blob"});
        saveFile(content, `FitNotes_Altered_${Date.now()}.zip`);
        
        finalizeSession();
    }
}

async function exportAlteredOnly() {
    if (!currentDb) return alert("Upload a DB first");
    if (applyChanges()) {
        const content = new Blob([currentDb.export()], { type: "application/octet-stream" });
        saveFile(content, "ALTERED_" + originalFileName);
        finalizeSession();
    }
}

// Ensure the helper functions for saving and finalizing remain
function saveFile(blob, name) {
    const link = document.createElement('a');
    link.href = URL.createObjectURL(blob);
    link.download = name;
    link.click();
}

function finalizeSession() {
    determineLastDate();
    showRecentEntries();
    // Keep textInput if user wants to double-check, or clear it:
    document.getElementById('textInput').value = '';
    updatePreview();
    addToLog("Files packaged successfully.", "info");
}

function resetPage() {
    location.reload(); // Simplest way to ensure a total clean state
}