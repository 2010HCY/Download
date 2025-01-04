const express = require('express');
const fs = require('fs');
const path = require('path');
const request = require('request');

const app = express();
const PORT = 80;

// 黑名单
const blackListFile = path.join(__dirname, 'blacklist.json');
// 日志
const logDir = path.join(__dirname, 'logs');
// 统计数据
const statsFile = path.join(__dirname, 'stats.json');

// 初始化
if (!fs.existsSync(blackListFile)) fs.writeFileSync(blackListFile, JSON.stringify([]));
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir);
if (!fs.existsSync(statsFile)) {
    fs.writeFileSync(
        statsFile,
        JSON.stringify({ totalVisitors: 0, totalDownloads: 0, totalDataTransferred: 0 })
    );
}

// 黑名单
function getBlackList() {
    return JSON.parse(fs.readFileSync(blackListFile));
}

function addToBlackList(ip) {
    const blackList = getBlackList();
    if (!blackList.includes(ip)) {
        blackList.push(ip);
        fs.writeFileSync(blackListFile, JSON.stringify(blackList));
        writeLog(`Added ${ip} to blacklist`);
    }
}

function isBlackListed(ip) {
    return getBlackList().includes(ip);
}
//希望此功能永远不要用上

// 日志，最大10MB
function writeLog(message) {
    const logMessage = `[${new Date().toISOString()}] ${message}\n`;
    const logFiles = fs.readdirSync(logDir).filter(f => f.startsWith('log-')).sort();
    const latestFile = logFiles.length > 0 ? path.join(logDir, logFiles[logFiles.length - 1]) : null;

    if (!latestFile || fs.statSync(latestFile).size >= 10 * 1024 * 1024) {
        const newFileName = `log-${Date.now()}.txt`;
        fs.writeFileSync(path.join(logDir, newFileName), logMessage);
    } else {
        fs.appendFileSync(latestFile, logMessage);
    }
}

// 统计数据
function updateStats(key, value) {
    const stats = JSON.parse(fs.readFileSync(statsFile));
    stats[key] += value;
    fs.writeFileSync(statsFile, JSON.stringify(stats));
}

// 访客 IP
function logVisitor(ip) {
    writeLog(`Visitor logged: ${ip}`);
    updateStats('totalVisitors', 1);
}

// 检查黑名单
app.use((req, res, next) => {
    const clientIp = req.ip;

    if (isBlackListed(clientIp)) {
        writeLog(`Blocked access from blacklisted IP: ${clientIp}`);
        return res.status(403).send('Access Denied');
    }

    logVisitor(clientIp);
    next();
});

// 下载代理路由
app.get('/download', (req, res) => {
    const { url } = req.query;

    if (!url || !/^https?:\/\/.+/.test(url)) {
        return res.status(400).send('Invalid URL');
    }

    const clientIp = req.ip;
    writeLog(`Download request from ${clientIp}: ${url}`);

    let fileSize = 0;

    request
        .get(url)
        .on('response', (response) => {
            const filename = url.split('/').pop() || 'downloaded-file';
            fileSize = parseInt(response.headers['content-length'], 10) || 0;

            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
            res.setHeader('Content-Type', response.headers['content-type']);
        })
        .on('data', (chunk) => {
            fileSize += chunk.length;
        })
        .on('end', () => {
            writeLog(`Completed download for ${clientIp}, size: ${fileSize} bytes`);
            updateStats('totalDownloads', 1);
            updateStats('totalDataTransferred', fileSize);
        })
        .on('error', (err) => {
            writeLog(`Error downloading file from ${url}: ${err.message}`);
            res.status(500).send('Error occurred while downloading the file.');
        })
        .pipe(res);
});

// 黑名单管理路由
app.post('/admin/blacklist', express.json(), (req, res) => {
    const { ip } = req.body;

    if (!ip || typeof ip !== 'string') {
        return res.status(400).send('Invalid IP');
    }

    addToBlackList(ip);
    res.send(`IP ${ip} added to blacklist.`);
});

app.listen(PORT, () => {
    writeLog(`Server started on port ${PORT}`);
    console.log(`Server running on http://localhost:${PORT}`);
});

//作者黄行山（Ethaniel）