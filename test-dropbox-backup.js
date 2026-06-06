require('dotenv').config();
const https = require('https');

async function testDropboxBackup() {
    console.log('Testing Dropbox backup...');
    
    const testData = {
        test: true,
        timestamp: new Date().toISOString(),
        message: 'This is a test backup from YourGallery'
    };
    
    const accessToken = process.env.DROPBOX_ACCESS_TOKEN;
    
    if (!accessToken) {
        console.error('❌ No Dropbox token found in .env');
        return;
    }
    
    const fileName = `test-backup-${Date.now()}.json`;
    
    const options = {
        hostname: 'content.dropboxapi.com',
        path: '/2/files/upload',
        method: 'POST',
        headers: {
            'Authorization': `Bearer ${accessToken}`,
            'Content-Type': 'application/octet-stream',
            'Dropbox-API-Arg': JSON.stringify({
                path: `/${fileName}`,
                mode: 'add',
                autorename: true
            })
        }
    };
    
    const req = https.request(options, (res) => {
        let data = '';
        res.on('data', chunk => data += chunk);
        res.on('end', () => {
            if (res.statusCode === 200) {
                console.log('✅ Test backup uploaded successfully!');
                console.log(`📁 Check your Dropbox at: Apps/Galleryyour/${fileName}`);
            } else {
                console.error('❌ Upload failed:', res.statusCode);
                console.log('Response:', data);
            }
        });
    });
    
    req.on('error', (err) => {
        console.error('❌ Error:', err.message);
    });
    
    req.write(JSON.stringify(testData));
    req.end();
}

testDropboxBackup();