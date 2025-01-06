const express = require('express');
const fs = require('fs');
const path = require('path');
const https = require('https');
const request = require('request');

const app = express();
const PORT = 443; // HTTPS 使用的默认端口

// HTTPS 证书文件路径
const certDir = path.join(__dirname, 'cert');
const sslOptions = {
    key: fs.readFileSync('/etc/letsencrypt/live/download.100713.xyz/privkey.pem'), // 私钥
    cert: fs.readFileSync('/etc/letsencrypt/live/download.100713.xyz/fullchain.pem'), // 证书
};

// 黑名单
const blackListFile = path.join(__dirname, 'blacklist.json');
// 日志
const logDir = path.join(__dirname, 'logs');
// 统计数据
const statsFile = path.join(__dirname, 'stats.json');

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
let logStartDate = new Date().toISOString().substring(0, 10);

function writeLog(message) {
    if (!fs.existsSync(logDir)) {
        fs.mkdirSync(logDir);
    }

    const logMessage = `[${new Date().toISOString()}] ${message}\n`;
    const logFileName = `log-${logStartDate}.txt`;
    const logFilePath = path.join(logDir, logFileName);

    if (!fs.existsSync(logFilePath) || fs.statSync(logFilePath).size >= 10 * 1024 * 1024) {
        logStartDate = new Date().toISOString().substring(0, 10);
        const newLogFileName = `log-${logStartDate}.txt`;
        fs.writeFileSync(path.join(logDir, newLogFileName), logMessage);
    } else {
        fs.appendFileSync(logFilePath, logMessage);
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

app.use(express.static(path.join(__dirname, 'public')));

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

const httpApp = express();
httpApp.use((req, res) => {
    const host = req.headers.host.replace(/:\d+$/, ''); 
    res.redirect(301, `https://${host}${req.url}`);
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

https.createServer(sslOptions, app).listen(PORT, () => {
    writeLog(`HTTPS server started on port ${PORT}`);
    console.log(`HTTPS server running on https://localhost:${PORT}`);
});

//作者黄行山（Ethaniel）