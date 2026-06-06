require('dotenv').config();
const nodemailer = require('nodemailer');

async function testEmail() {
    console.log('Testing email configuration...');
    console.log('Host:', process.env.EMAIL_HOST);
    console.log('Port:', process.env.EMAIL_PORT);
    console.log('User:', process.env.EMAIL_USER);
    
    const transporter = nodemailer.createTransport({
        host: process.env.EMAIL_HOST,
        port: parseInt(process.env.EMAIL_PORT),
        secure: process.env.EMAIL_SECURE === 'true',
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASS
        },
        tls: { rejectUnauthorized: false },
        connectionTimeout: 30000,
        greetingTimeout: 30000,
        socketTimeout: 30000
    });
    
    try {
        await transporter.verify();
        console.log('Email server connection successful');
        
        const info = await transporter.sendMail({
            from: `"YourGallery" <${process.env.EMAIL_USER}>`,
            to: process.env.EMAIL_USER,
            subject: 'Test Email',
            text: 'This is a test email from YourGallery',
            html: '<h2>Test Successful</h2><p>Your email is working!</p>'
        });
        console.log('Email sent:', info.messageId);
    } catch (error) {
        console.error('Email error:', error.message);
        console.error('Error code:', error.code);
    }
}

testEmail();