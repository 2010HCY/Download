const fs = require('fs');
const path = require('path');

const logDir = path.join(__dirname, 'logs');
const outputFile = path.join(__dirname, 'output.txt');

function analyzeLogs() {
    if (!fs.existsSync(logDir)) {
        console.log('日志目录不存在！');
        return;
    }

    const logFiles = fs.readdirSync(logDir).filter(file => file.startsWith('log-'));
    if (logFiles.length === 0) {
        console.log('没有日志文件可以分析。');
        return;
    }

    let totalVisitors = 0;
    let totalDownloads = 0;
    let totalDataTransferred = 0;
    const ipStats = {};

    logFiles.forEach(logFile => {
        const logContent = fs.readFileSync(path.join(logDir, logFile), 'utf8');
        const logLines = logContent.split('\n').filter(line => line.trim() !== '');

        logLines.forEach(line => {
            const visitorMatch = line.match(/Visitor logged: (::ffff:)?(\d+\.\d+\.\d+\.\d+)/);
            if (visitorMatch) {
                const ip = visitorMatch[2];
                const timestamp = line.match(/\[(.*?)\]/)?.[1];
                totalVisitors++;
                if (!ipStats[ip]) {
                    ipStats[ip] = { visits: 0, downloads: 0, dataTransferred: 0, lastVisit: null };
                }
                ipStats[ip].visits++;
                if (timestamp) ipStats[ip].lastVisit = convertToHumanReadableTime(timestamp);
            }

            const completedDownloadMatch = line.match(/Completed download for (::ffff:)?(\d+\.\d+\.\d+\.\d+), size: (\d+) bytes/);
            if (completedDownloadMatch) {
                const ip = completedDownloadMatch[2];
                const size = parseInt(completedDownloadMatch[3], 10);
                const timestamp = line.match(/\[(.*?)\]/)?.[1];
                totalDownloads++;
                totalDataTransferred += size;

                if (!ipStats[ip]) {
                    ipStats[ip] = { visits: 0, downloads: 0, dataTransferred: 0, lastVisit: null };
                }
                ipStats[ip].downloads++;
                ipStats[ip].dataTransferred += size;
                if (timestamp) ipStats[ip].lastVisit = convertToHumanReadableTime(timestamp);
            }
        });
    });

    const sortedIps = Object.entries(ipStats).sort(([, a], [, b]) => b.downloads - a.downloads);

    // 控制台只会输出下载量最大的前10个IP
    console.log('====== 日志分析结果 ======');
    console.log(`总访客数: ${totalVisitors}`);
    console.log(`总下载次数: ${totalDownloads}`);
    console.log(`总数据传输量: ${(totalDataTransferred / 1024 / 1024).toFixed(2)} MB`);
    console.log('\n按下载量最多的前10个IP:');
    sortedIps.slice(0, 10).forEach(([ip, stats], index) => {
        console.log(`排名: ${index + 1}`);
        console.log(`IP: ${ip}`);
        console.log(`  访问次数: ${stats.visits}`);
        console.log(`  下载次数: ${stats.downloads}`);
        console.log(`  数据传输量: ${(stats.dataTransferred / 1024 / 1024).toFixed(2)} MB`);
        console.log(`  最后访问时间: ${stats.lastVisit || '未知'}`);
    });
    console.log('=========================');

    // 写入结果到文件
    const outputLines = [];
    outputLines.push('====== 日志分析结果 ======');
    outputLines.push(`总访客数: ${totalVisitors}`);
    outputLines.push(`总下载次数: ${totalDownloads}`);
    outputLines.push(`总数据传输量: ${(totalDataTransferred / 1024 / 1024).toFixed(2)} MB`);
    outputLines.push('\n按下载量排序的所有IP:');
    sortedIps.forEach(([ip, stats], index) => {
        outputLines.push(`排名: ${index + 1}`);
        outputLines.push(`IP: ${ip}`);
        outputLines.push(`  访问次数: ${stats.visits}`);
        outputLines.push(`  下载次数: ${stats.downloads}`);
        outputLines.push(`  数据传输量: ${(stats.dataTransferred / 1024 / 1024).toFixed(2)} MB`);
        outputLines.push(`  最后访问时间: ${stats.lastVisit || '未知'}`);
    });
    outputLines.push('=========================');

    fs.writeFileSync(outputFile, outputLines.join('\n'), 'utf8');
    console.log(`完整排序结果已保存到: ${outputFile}`);
}

// 把日期格式转换为地球人可读的时间格式
function convertToHumanReadableTime(timestamp) {
    if (!timestamp) return null;
    try {
        const date = new Date(timestamp);
        return date.toISOString().replace('T', ' ').substring(0, 19);
    } catch (err) {
        return null;
    }
}

analyzeLogs();
