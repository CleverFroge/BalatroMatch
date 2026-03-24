const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = 8888;

http.createServer((req, res) => {
    // 只处理根路径和index.html
    const filePath = path.join(__dirname, req.url === '/' ? 'index.html' : req.url);
    
    fs.readFile(filePath, (err, data) => {
        if (err) {
            res.writeHead(404);
            res.end('Not Found');
            return;
        }
        res.writeHead(200, {'Content-Type': 'text/html; charset=utf-8'});
        res.end(data);
    });
}).listen(PORT, () => {
    console.log(`Server is running on http://localhost:${PORT}`);
});