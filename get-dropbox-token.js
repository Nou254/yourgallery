const fetch = require('node-fetch');

const CLIENT_ID = 'wirg2s646mezpuz';
const CLIENT_SECRET = '9hcx1qd6edeid31';

async function getRefreshToken() {
    console.log('Getting Dropbox Refresh Token...');
    console.log('\n1. Go to this URL in your browser:');
    const authUrl = `https://www.dropbox.com/oauth2/authorize?client_id=${CLIENT_ID}&response_type=code&token_access_type=offline`;
    console.log(authUrl);
    
    console.log('\n2. Log in and authorize the app');
    console.log('3. After authorization, you will be redirected to a URL like:');
    console.log('   https://localhost/?code=AUTH_CODE');
    console.log('\n4. Copy the code from the URL (the part after "code=")');
    console.log('\n5. Enter the code here:');
    
    // For command line input
    const readline = require('readline').createInterface({
        input: process.stdin,
        output: process.stdout
    });
    
    readline.question('Enter authorization code: ', async (code) => {
        readline.close();
        
        const tokenUrl = 'https://api.dropboxapi.com/oauth2/token';
        const params = new URLSearchParams();
        params.append('code', code);
        params.append('grant_type', 'authorization_code');
        params.append('client_id', CLIENT_ID);
        params.append('client_secret', CLIENT_SECRET);
        
        try {
            const response = await fetch(tokenUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded',
                },
                body: params
            });
            
            const data = await response.json();
            
            if (data.refresh_token) {
                console.log('\n✅ Success! Add these to your .env file:\n');
                console.log(`DROPBOX_ACCESS_TOKEN=${data.access_token}`);
                console.log(`DROPBOX_REFRESH_TOKEN=${data.refresh_token}`);
                console.log(`DROPBOX_CLIENT_ID=${CLIENT_ID}`);
                console.log(`DROPBOX_CLIENT_SECRET=${CLIENT_SECRET}`);
            } else {
                console.error('Error:', data);
            }
        } catch (error) {
            console.error('Error getting token:', error.message);
        }
    });
}

getRefreshToken();