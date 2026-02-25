// vscode扩展id(vscode extension id): EXCEEDSYSTEM.vscode-macros
// 修改后可 Ctrl Shift P 输入 select a macro file 或输入 reload window 快速生效
// THANK Ai
const vscode = require('vscode');
const fs = require('fs');
const readline = require('readline');
const path = require('path');

/**
 * Macro configuration settings
 * { [name: string]: {              ... Name of the macro
 *    no: number,                   ... Order of the macro
 *    func: ()=> string | undefined ... Name of the body of the macro function
 *  }
 * }
 */
module.exports.macroCommands = {
    时间调整: {
        no: 1,
        func: adjustTime
    },
    替换歌名为BV: {
        no: 1,
        func: replaceWithBV
    },
};

async function replaceWithBV() {
    const playlistDir = path.join(__dirname, '歌单');
    try {
        const playlistFiles = fs.readdirSync(playlistDir).filter(file => file.endsWith('.txt'));
        if (playlistFiles.length === 0) {
            return 'No playlist files found in 歌单 directory.';
        }

        // Let user select a playlist file
        const selectedPlaylist = await vscode.window.showQuickPick(playlistFiles, {
            placeHolder: 'Select a playlist file'
        });

        if (!selectedPlaylist) {
            return 'No playlist file selected.';
        }

        // Read selected playlist file
        const playlistPath = path.join(playlistDir, selectedPlaylist);
        // const playlistContent = fs.readFileSync(playlistPath, 'utf8');

        // Parse playlist content to get song name to BV mapping (allow multiple BV numbers per song)
        const songToBVMap = await createMapFromSonglistFile(playlistPath);
        if (songToBVMap.size === 0) {
            return 'No songs with BV numbers found in selected playlist.';
        }
        await searchAndReplace(/(^.*)(\d{2}:\d{2}:\d{2})\s+(.+)/gm, (match, lineStart, timePart, songPart) => {
            // Extract song name (remove any existing BV numbers)
            const cleanSongName = songPart.replace(/BV\w+/g, '').trim();
            const lowerSongName = cleanSongName.toLowerCase();

            // Check if song name exists in the map (case-insensitive)
            if (songToBVMap.has(lowerSongName)) {
                const bvNumbers = songToBVMap.get(lowerSongName);
                return `${lineStart}${timePart} ${bvNumbers.join(' ')}`;
            }
            return match; // No match, keep original
        });
    } catch (error) {
        return `Error processing playlists: ${error.message}`;
    }
}

/**
 * 读取歌单文件，建立数据结构 map(str: list)
 *   - 歌名(小写)：[BV1, BV2, ...]
 * 歌单文件数据结构：
 *   - # 开头为注释行, ','和'/'为分隔符
 *   - BV, 歌名(大小写), 歌名2, 歌名3, 英文名/中文名/其他语言名/简写,
 *   - 歌名含分隔符：BV,, 歌名(大小写),, 歌名2,, 歌名3,, 英文名\\中文名\\其他语言名\\简写,,
 */
async function createMapFromSonglistFile(file_path) {
    const songName_multiBV_map = new Map();

    // 1. 创建文件读取流
    const fileStream = fs.createReadStream(file_path, { encoding: 'utf8' });

    // 2. 创建逐行读取接口
    const rl = readline.createInterface({
        input: fileStream,
        crlfDelay: Infinity // 支持所有换行符 (CRLF/LF)
    });

    let lineCount = 0;

    try {
        for await (const line of rl) {
            lineCount++;
            const trimmedLine = line.trim();

            // 跳过空行和注释
            if (!trimmedLine || trimmedLine.startsWith('#')) continue;

            // 3. 动态识别分隔符模式
            const isDoubleMode = trimmedLine.includes(',,');
            const songDelimiter = isDoubleMode ? ',,' : ',';
            const sameNameDelimiter = isDoubleMode ? '\\' : '/';

            // 4. 解析行数据
            const parts = trimmedLine.split(songDelimiter)
                .map(p => p.trim())
                .filter(p => p !== '');

            // 防止 BV 后跟中文逗号
            if (parts.length < 2) {
                // 仅作提示，不中断执行
                vscode.window.showWarningMessage(`第 ${lineCount} 行格式异常，文件为 ${file_path}`);
                continue;
            }

            const bv = parts[0];
            const nameParts = parts.slice(1);

            for (const section of nameParts) {
                const names = section.split(sameNameDelimiter);

                for (let name of names) {
                    name = name.trim().toLowerCase();
                    if (!name) {
                        // 仅作提示，不中断执行
                        vscode.window.showWarningMessage(`第 ${lineCount} 行格式异常，文件为 ${file_path}`);
                        continue;
                    }

                    addValueToMap(songName_multiBV_map, name.toLowerCase(), bv);
                }
            }
        }
    } catch (err) {
        console.error(`解析文件时出错 [行 ${lineCount}]:`, err);
        throw err; // 或者使用 vscode.window.showErrorMessage
    }

    return songName_multiBV_map;
}

function addValueToMap(map, key, newValue) {
    if (map.has(key)) {
        // 如果键存在，获取当前值并添加新值
        map.get(key).push(newValue);
    } else {
        // 如果键不存在，创建一个新列表并添加新值
        map.set(key, [newValue]);
    }
}

async function adjustTime() {
    const regex = /(\d+):(\d+):(\d+(\.\d+)?)/g;
    const inputValue = await input(prompt = 'Enter time adjustment (e.g., "1h2m3.1s" or "-1h2m3.1s")',
        placeHolder = '1h2m3s');
    if (!inputValue) {
        return 'No adjustment value entered.';
    }
    const adjustmentSeconds = parseTimeAdjustment(inputValue);
    if (adjustmentSeconds === null) {
        return 'Invalid time adjustment format. Use format like "1h2m3s".';
    }

    await searchAndReplace(regex, (match, hours, minutes, seconds) => {
        // Convert to total seconds
        let totalSeconds = parseInt(hours) * 3600 + parseInt(minutes) * 60 + parseFloat(seconds);
        // Apply adjustment
        totalSeconds += adjustmentSeconds;
        // Ensure non-negative time
        totalSeconds = Math.max(0, totalSeconds);
        // Convert back to HH:MM:SS format
        const newHours = Math.floor(totalSeconds / 3600).toString().padStart(2, '0');
        const newMinutes = Math.floor((totalSeconds % 3600) / 60).toString().padStart(2, '0');
        const newSeconds = Math.floor(totalSeconds % 60).toString().padStart(2, '0');
        return `${newHours}:${newMinutes}:${newSeconds}`;
    });
}

/**
 * Parses a time adjustment string like "1h2m3.1s" or "-1h2m3.1s" to total seconds
 */
function parseTimeAdjustment(adjustmentStr) {
    // Regular expression to match time components
    const timeComponentRegex = /([+-]?\d+)h|([+-]?\d+)m|([+-]?\d+(\.\d+)?)s/gi;
    let totalSeconds = 0.0;
    let match;

    // Extract each time component and convert to seconds
    while ((match = timeComponentRegex.exec(adjustmentStr)) !== null) {
        if (match[1]) {
            // Hours
            totalSeconds += parseFloat(match[1]) * 3600;
        } else if (match[2]) {
            // Minutes
            totalSeconds += parseFloat(match[2]) * 60;
        } else if (match[3]) {
            // Seconds
            totalSeconds += parseFloat(match[3]);
        }
    }

    // Check if any valid components were found
    // return totalSeconds !== 0 ? totalSeconds : null;
    return totalSeconds;
}

/**
 * 将秒数（包含小数部分）转换为 HH:MM:SS.sss 格式的时间字符串
 * @param {number} totalSeconds - 总的秒数 (例如: 4405.123)
 * @returns {string} 格式化后的时间字符串 (例如: "01:23:45.123")
 */
function formatSecondsToHMS(totalSeconds) {
    // 确保输入值非负
    totalSeconds = Math.abs(totalSeconds);

    // 1. 提取小时数
    const hours = Math.floor(totalSeconds / 3600);

    // 2. 计算剩余分钟和秒钟
    const remainingAfterHours = totalSeconds % 3600;
    const minutes = Math.floor(remainingAfterHours / 60);
    const secondsWithMs = remainingAfterHours % 60;

    // 3. 分离整数秒和毫秒
    const wholeSeconds = Math.floor(secondsWithMs);
    const milliseconds = Math.round((secondsWithMs - wholeSeconds) * 1000);

    // 4. 使用 padStart 方法确保 HH, MM, SS 都是两位数，sss 是三位数
    const formattedHours = String(hours).padStart(2, '0');
    const formattedMinutes = String(minutes).padStart(2, '0');
    const formattedSeconds = String(wholeSeconds).padStart(2, '0');
    const formattedMilliseconds = String(milliseconds).padStart(3, '0');

    return `${formattedHours}:${formattedMinutes}:${formattedSeconds}.${formattedMilliseconds}`;
}

async function searchAndReplace(regex, callback) {
    const editor = vscode.window.activeTextEditor;
    if (!editor) {
        return 'Editor is not opening.';
    }
    const document = editor.document;
    let selection = editor.selection;

    // If no text is selected, use the entire document
    let text;
    if (selection.isEmpty) {
        const entireDocument = new vscode.Range(
            document.positionAt(0),
            document.positionAt(document.getText().length)
        );
        text = document.getText(entireDocument);
        selection = entireDocument;
    } else {
        text = document.getText(selection);
    }

    const updatedText = text.replace(regex, callback);
    editor.edit(editBuilder => {
        editBuilder.replace(selection, updatedText);
    });
}

async function input(prompt = '标题', placeHolder = '参考') {
    return await vscode.window.showInputBox({
        prompt: prompt,
        placeHolder: placeHolder
    });
}