require('dotenv').config();
const express = require('express');
const mysql = require('mysql2');
const bcrypt = require('bcrypt');
const multer = require('multer');
const session = require('express-session');
const nodemailer = require('nodemailer');
const path = require('path');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 3000;

// ========================================
// DATABASE CONNECTION WITH SSL SUPPORT
// ========================================

const sslConfig = process.env.DB_SSL === 'true' ? {
    rejectUnauthorized: false
} : false;

const db = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: parseInt(process.env.DB_PORT) || 3306,
    ssl: sslConfig,
    waitForConnections: true,
    connectionLimit: 10,
    queueLimit: 0,
    enableKeepAlive: true,
    keepAliveInitialDelay: 0,
    connectTimeout: 60000
});

async function testDatabaseConnection() {
    try {
        const connection = await db.promise().getConnection();
        console.log('Database connected successfully (SSL enabled)');
        connection.release();
        return true;
    } catch (error) {
        console.error('Database connection failed:', error.message);
        return false;
    }
}

// ========================================
// EMAIL TRANSPORTER (SMTP)
// ========================================
const transporter = nodemailer.createTransport({
    host: process.env.EMAIL_HOST || 'smtp.gmail.com',
    port: parseInt(process.env.EMAIL_PORT) || 587,
    secure: process.env.EMAIL_SECURE === 'true',
    auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS
    },
    tls: { rejectUnauthorized: false }
});

transporter.verify((error, success) => {
    if (error) {
        console.error('Email error:', error.message);
    } else {
        console.log('Email service ready');
    }
});

// ========================================
// MIDDLEWARE
// ========================================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static('public'));
app.use('/uploads', express.static('uploads'));

app.use(session({
    secret: process.env.SESSION_SECRET || 'yourgallery-secret-key',
    resave: false,
    saveUninitialized: false,
    cookie: { 
        secure: false,
        maxAge: 24 * 60 * 60 * 1000,
        httpOnly: true,
        sameSite: 'lax'
    }
}));

// ========================================
// FAVICON ROUTE
// ========================================
app.get('/favicon.png', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'favicon.png'));
});

app.get('/favicon.ico', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'favicon.png'));
});

// ========================================
// FILE UPLOAD SETUP
// ========================================
const profileStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/temp_profiles/'),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});

const photoStorage = multer.diskStorage({
    destination: (req, file, cb) => cb(null, 'uploads/photos/'),
    filename: (req, file, cb) => cb(null, Date.now() + '-' + file.originalname)
});

const uploadProfile = multer({ 
    storage: profileStorage, 
    limits: { fileSize: 2 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/gif'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only JPEG, PNG, JPG, GIF allowed.'));
        }
    }
});

const uploadPhoto = multer({ 
    storage: photoStorage, 
    limits: { fileSize: 5 * 1024 * 1024 },
    fileFilter: (req, file, cb) => {
        const allowedTypes = ['image/jpeg', 'image/png', 'image/jpg', 'image/gif', 'image/webp'];
        if (allowedTypes.includes(file.mimetype)) {
            cb(null, true);
        } else {
            cb(new Error('Invalid file type. Only images allowed.'));
        }
    }
});

if (!fs.existsSync('uploads/temp_profiles')) fs.mkdirSync('uploads/temp_profiles', { recursive: true });
if (!fs.existsSync('uploads/photos')) fs.mkdirSync('uploads/photos', { recursive: true });
if (!fs.existsSync('uploads/profiles')) fs.mkdirSync('uploads/profiles', { recursive: true });
if (!fs.existsSync('backups')) fs.mkdirSync('backups', { recursive: true });

// ========================================
// DATABASE AUTO-CREATION (Tables)
// ========================================
async function initializeDatabase() {
    console.log('\nChecking database tables...');
    
    const createUsersTable = `
        CREATE TABLE IF NOT EXISTS users (
            id INT AUTO_INCREMENT PRIMARY KEY,
            email VARCHAR(255) UNIQUE NOT NULL,
            name VARCHAR(100) NOT NULL,
            gender ENUM('Male', 'Female', 'Other') NOT NULL,
            age INT NOT NULL,
            profile_pic VARCHAR(255),
            password_hash VARCHAR(255) NOT NULL,
            is_verified BOOLEAN DEFAULT FALSE,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_email (email),
            INDEX idx_created_at (created_at)
        )
    `;
    
    const createPhotosTable = `
        CREATE TABLE IF NOT EXISTS photos (
            id INT AUTO_INCREMENT PRIMARY KEY,
            user_id INT NOT NULL,
            image_path VARCHAR(255) NOT NULL,
            caption TEXT,
            uploaded_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
            INDEX idx_user_id (user_id),
            INDEX idx_uploaded_at (uploaded_at)
        )
    `;
    
    const createAdminsTable = `
        CREATE TABLE IF NOT EXISTS admins (
            id INT AUTO_INCREMENT PRIMARY KEY,
            email VARCHAR(255) UNIQUE NOT NULL,
            password_hash VARCHAR(255) NOT NULL,
            INDEX idx_email (email)
        )
    `;
    
    const createOtpTable = `
        CREATE TABLE IF NOT EXISTS otp_codes (
            id INT AUTO_INCREMENT PRIMARY KEY,
            email VARCHAR(255) NOT NULL,
            otp_code VARCHAR(6) NOT NULL,
            purpose ENUM('verification', 'reset') NOT NULL,
            expires_at TIMESTAMP NOT NULL,
            created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
            INDEX idx_email_purpose (email, purpose),
            INDEX idx_expires_at (expires_at),
            INDEX idx_otp_code (otp_code)
        )
    `;
    
    const insertAdmin = `
        INSERT INTO admins (email, password_hash) VALUES 
        ('darkhumor298@gmail.com', '$2b$10$YQr3YvYqLpX7WJ8L9MkZJeFgHjKlQwErTyUiOpAsDfGhJkLzXcVbN')
        ON DUPLICATE KEY UPDATE email=email
    `;
    
    try {
        await db.promise().query(createUsersTable);
        console.log('Users table ready');
        
        await db.promise().query(createPhotosTable);
        console.log('Photos table ready');
        
        await db.promise().query(createAdminsTable);
        console.log('Admins table ready');
        
        await db.promise().query(createOtpTable);
        console.log('OTP codes table ready');
        
        await db.promise().query(insertAdmin);
        console.log('Admin user ready');
        
        console.log('Database initialization complete!\n');
        return true;
    } catch (error) {
        console.error('Database initialization error:', error.message);
        return false;
    }
}

// ========================================
// AUTO-BACKUP SYSTEM
// ========================================

async function backupToLocal() {
    try {
        const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
        const backupFile = `backups/backup-${timestamp}.json`;
        
        const [users] = await db.promise().query('SELECT id, email, name, gender, age, profile_pic, is_verified, created_at FROM users');
        const [photos] = await db.promise().query('SELECT id, user_id, image_path, caption, uploaded_at FROM photos');
        const [admins] = await db.promise().query('SELECT id, email FROM admins');
        
        const backupData = {
            timestamp: new Date().toISOString(),
            version: '1.0',
            tables: {
                users: users,
                photos: photos,
                admins: admins
            }
        };
        
        fs.writeFileSync(backupFile, JSON.stringify(backupData, null, 2));
        console.log(`Local backup created: ${backupFile}`);
        
        const backups = fs.readdirSync('backups').filter(f => f.startsWith('backup-')).sort();
        while (backups.length > 10) {
            const oldest = backups.shift();
            fs.unlinkSync(`backups/${oldest}`);
            console.log(`Removed old backup: ${oldest}`);
        }
        
        return backupData;
    } catch (error) {
        console.error('Local backup failed:', error.message);
        return null;
    }
}

const BACKUP_INTERVAL_HOURS = parseInt(process.env.BACKUP_INTERVAL_HOURS) || 24;
setInterval(async () => {
    console.log('\nRunning scheduled backup...');
    await backupToLocal();
}, BACKUP_INTERVAL_HOURS * 60 * 60 * 1000);

setTimeout(async () => {
    console.log('Running initial backup...');
    await backupToLocal();
}, 5 * 60 * 1000);

// ========================================
// BACKUP API ENDPOINTS
// ========================================
app.post('/api/admin/backup', async (req, res) => {
    if (!req.session.isAdmin) {
        return res.status(403).json({ error: 'Unauthorized' });
    }
    
    const backupData = await backupToLocal();
    if (backupData) {
        res.json({ message: 'Backup completed successfully', timestamp: backupData.timestamp });
    } else {
        res.status(500).json({ error: 'Backup failed' });
    }
});

app.get('/api/admin/backups/list', async (req, res) => {
    if (!req.session.isAdmin) return res.status(403).json({ error: 'Unauthorized' });
    
    try {
        const files = fs.readdirSync('backups');
        const backupFiles = files.filter(f => f.startsWith('backup-')).map(f => ({
            name: f,
            size: fs.statSync(`backups/${f}`).size,
            date: f.replace('backup-', '').replace('.json', '')
        })).sort((a, b) => b.date.localeCompare(a.date));
        
        res.json(backupFiles);
    } catch (error) {
        res.status(500).json({ error: 'Failed to list backups' });
    }
});

// ========================================
// HELPER FUNCTIONS
// ========================================
function generateOTP() {
    return Math.floor(100000 + Math.random() * 900000).toString();
}

async function sendEmail(to, subject, text, html) {
    try {
        const info = await transporter.sendMail({
            from: `"YourGallery" <${process.env.EMAIL_USER}>`,
            to: to,
            subject: subject,
            text: text,
            html: html
        });
        console.log(`Email sent to ${to}`);
        return true;
    } catch (error) {
        console.error('Email error:', error.message);
        return false;
    }
}

async function saveOTP(email, otp, purpose) {
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000);
    await db.promise().query(
        'INSERT INTO otp_codes (email, otp_code, purpose, expires_at) VALUES (?, ?, ?, ?)',
        [email, otp, purpose, expiresAt]
    );
}

async function verifyOTP(email, otp, purpose) {
    const [rows] = await db.promise().query(
        'SELECT * FROM otp_codes WHERE email = ? AND otp_code = ? AND purpose = ? AND expires_at > NOW() ORDER BY created_at DESC LIMIT 1',
        [email, otp, purpose]
    );
    if (rows.length > 0) {
        await db.promise().query('DELETE FROM otp_codes WHERE id = ?', [rows[0].id]);
        return true;
    }
    return false;
}

// ========================================
// AUTHENTICATION MIDDLEWARE
// ========================================
function isAuthenticated(req, res, next) {
    if (req.session.userId && !req.session.isAdmin) {
        next();
    } else {
        res.redirect('/login');
    }
}

function isAdmin(req, res, next) {
    if (req.session.isAdmin) {
        next();
    } else {
        res.redirect('/login');
    }
}

// ========================================
// USER ROUTES
// ========================================
app.get('/', (req, res) => {
    if (req.session.userId || req.session.isAdmin) {
        res.redirect(req.session.isAdmin ? '/admin/dashboard' : '/gallery');
    } else {
        res.sendFile(path.join(__dirname, 'public', 'home.html'));
    }
});

app.get('/register', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'register.html'));
});

app.post('/register', uploadProfile.single('profile_pic'), async (req, res) => {
    const { email, name, gender, age, password } = req.body;
    const profilePic = req.file ? req.file.filename : null;

    if (!email || !name || !gender || !age || !password) {
        return res.status(400).send('All fields except profile picture are required.');
    }

    try {
        const [existing] = await db.promise().query('SELECT id FROM users WHERE email = ?', [email]);
        if (existing.length > 0) {
            return res.status(400).send('Email already registered.');
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        
        req.session.pendingUser = {
            email,
            name,
            gender,
            age,
            profile_pic: profilePic,
            password_hash: hashedPassword
        };
        
        const otp = generateOTP();
        await saveOTP(email, otp, 'verification');
        
        const html = `
            <!DOCTYPE html>
            <html>
            <head>
                <style>
                    body { font-family: Arial, sans-serif; line-height: 1.6; }
                    .container { max-width: 500px; margin: 0 auto; padding: 20px; }
                    .otp { font-size: 28px; font-weight: bold; background: #f4f4f4; padding: 10px; text-align: center; letter-spacing: 5px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <h2>Welcome to YourGallery!</h2>
                    <p>Hello <strong>${name}</strong>,</p>
                    <p>Your verification code is:</p>
                    <div class="otp">${otp}</div>
                    <p>This code expires in 15 minutes.</p>
                    <p>If you didn't create this account, please ignore this email.</p>
                </div>
            </body>
            </html>
        `;
        
        await sendEmail(email, 'Verify Your Email - YourGallery', `Your OTP: ${otp}`, html);
        
        console.log(`Registration data cached for ${email}. Redirecting to OTP verification.`);
        return res.redirect('/verify-otp?purpose=verification');
        
    } catch (err) {
        console.error('Registration error:', err);
        res.status(500).send('Registration failed: ' + err.message);
    }
});

app.get('/verify-otp', (req, res) => {
    const purpose = req.query.purpose;
    
    if (purpose === 'verification' && !req.session.pendingUser) {
        return res.redirect('/register');
    }
    
    if (purpose === 'reset' && !req.session.resetEmail) {
        return res.redirect('/forgot-password');
    }
    
    res.sendFile(path.join(__dirname, 'public', 'verify-otp.html'));
});

app.post('/verify-otp', async (req, res) => {
    const { otp } = req.body;
    const email = req.session.pendingUser?.email || req.session.resetEmail;
    const purpose = req.session.pendingUser ? 'verification' : 'reset';

    console.log(`Verifying OTP for email: ${email}, purpose: ${purpose}`);

    if (!email) {
        return res.status(400).send('Session expired. Please try again.');
    }

    const isValid = await verifyOTP(email, otp, purpose);
    
    if (!isValid) {
        return res.status(400).send('Invalid or expired OTP. Please request a new one.');
    }

    if (purpose === 'verification') {
        const pendingUser = req.session.pendingUser;
        
        try {
            let finalProfilePic = null;
            if (pendingUser.profile_pic) {
                const tempPath = path.join(__dirname, 'uploads/temp_profiles', pendingUser.profile_pic);
                const permanentPath = path.join(__dirname, 'uploads/profiles', pendingUser.profile_pic);
                if (fs.existsSync(tempPath)) {
                    fs.renameSync(tempPath, permanentPath);
                    finalProfilePic = `/uploads/profiles/${pendingUser.profile_pic}`;
                }
            }
            
            await db.promise().query(
                'INSERT INTO users (email, name, gender, age, profile_pic, password_hash, is_verified) VALUES (?, ?, ?, ?, ?, ?, TRUE)',
                [pendingUser.email, pendingUser.name, pendingUser.gender, pendingUser.age, finalProfilePic, pendingUser.password_hash]
            );
            
            console.log(`User ${pendingUser.email} verified and saved to database`);
            
            delete req.session.pendingUser;
            
            return res.redirect('/login?verified=1');
        } catch (err) {
            console.error('Error saving verified user:', err);
            return res.status(500).send('Error completing registration. Please try again.');
        }
    } else {
        req.session.resetVerified = true;
        return res.redirect('/reset-password');
    }
});

app.post('/resend-otp', async (req, res) => {
    const email = req.session.pendingUser?.email || req.session.resetEmail;
    if (!email) {
        return res.status(400).json({ error: 'No pending verification' });
    }

    const otp = generateOTP();
    await saveOTP(email, otp, req.session.pendingUser ? 'verification' : 'reset');
    
    const html = `<h2>Your New OTP</h2><p>Your new OTP is: <strong>${otp}</strong></p><p>Valid for 15 minutes.</p>`;
    await sendEmail(email, 'Your New OTP - YourGallery', `Your OTP: ${otp}`, html);
    
    res.json({ message: 'OTP resent successfully' });
});

app.get('/forgot-password', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'forgot-password.html'));
});

app.post('/forgot-password', async (req, res) => {
    const { email } = req.body;
    
    const [users] = await db.promise().query('SELECT id, name FROM users WHERE email = ?', [email]);
    if (users.length === 0) {
        return res.status(404).send('Email not found.');
    }

    const otp = generateOTP();
    await saveOTP(email, otp, 'reset');
    req.session.resetEmail = email;
    
    const html = `<h2>Password Reset</h2><p>Your OTP: <strong>${otp}</strong></p><p>Valid for 15 minutes.</p>`;
    await sendEmail(email, 'Reset Your Password - YourGallery', `Your OTP: ${otp}`, html);
    
    res.redirect('/verify-otp?purpose=reset');
});

app.get('/reset-password', (req, res) => {
    if (!req.session.resetVerified) {
        return res.redirect('/forgot-password');
    }
    res.sendFile(path.join(__dirname, 'public', 'reset-password.html'));
});

app.post('/reset-password', async (req, res) => {
    const { password } = req.body;
    const email = req.session.resetEmail;
    
    if (!req.session.resetVerified || !email) {
        return res.status(400).send('Invalid reset session.');
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    await db.promise().query('UPDATE users SET password_hash = ? WHERE email = ?', [hashedPassword, email]);
    
    delete req.session.resetEmail;
    delete req.session.resetVerified;
    
    res.redirect('/login?reset=1');
});

// ========================================
// UNIFIED LOGIN - Single page for both admin and users
// ========================================
app.get('/login', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'login.html'));
});

app.post('/login', async (req, res) => {
    const { email, password } = req.body;
    
    console.log('Login attempt:', email);
    
    try {
        // FIRST: Check if admin
        const [admins] = await db.promise().query('SELECT * FROM admins WHERE email = ?', [email]);
        if (admins.length > 0) {
            const match = await bcrypt.compare(password, admins[0].password_hash);
            if (match) {
                req.session.isAdmin = true;
                req.session.adminEmail = admins[0].email;
                console.log('Admin login successful:', email);
                return res.redirect('/admin/dashboard');
            }
        }
        
        // SECOND: Check regular users (must be verified)
        const [users] = await db.promise().query('SELECT * FROM users WHERE email = ? AND is_verified = TRUE', [email]);
        if (users.length > 0) {
            const match = await bcrypt.compare(password, users[0].password_hash);
            if (match) {
                req.session.userId = users[0].id;
                req.session.userName = users[0].name;
                req.session.isAdmin = false;
                console.log('User login successful:', email);
                return res.redirect('/gallery');
            }
        }
        
        // If we get here, credentials are invalid
        console.log('Login failed for:', email);
        return res.status(401).send('Invalid email or password. If you recently registered, please verify your email first.');
        
    } catch (error) {
        console.error('Login error:', error);
        res.status(500).send('Login failed. Please try again.');
    }
});

// ========================================
// USER GALLERY ROUTES
// ========================================
app.get('/gallery', isAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'gallery.html'));
});

app.get('/api/photos', (req, res) => {
    const sql = `
        SELECT photos.id, photos.image_path, photos.caption, photos.uploaded_at,
               users.name AS uploader_name, users.profile_pic
        FROM photos 
        JOIN users ON photos.user_id = users.id
        WHERE users.is_verified = TRUE
        ORDER BY photos.uploaded_at DESC
    `;
    db.query(sql, (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(results);
    });
});

app.get('/api/preview-photos', (req, res) => {
    const sql = `
        SELECT photos.image_path, photos.caption, photos.uploaded_at, users.name AS uploader_name
        FROM photos 
        JOIN users ON photos.user_id = users.id
        WHERE users.is_verified = TRUE
        ORDER BY photos.uploaded_at DESC 
        LIMIT 6
    `;
    db.query(sql, (err, results) => {
        if (err) {
            console.error(err);
            return res.status(500).json({ error: 'Database error' });
        }
        res.json(results);
    });
});

app.get('/upload', isAuthenticated, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'upload.html'));
});

app.post('/upload', isAuthenticated, uploadPhoto.single('photo'), (req, res) => {
    const { caption } = req.body;
    if (!req.file) return res.status(400).send('No photo uploaded.');
    
    const imagePath = `/uploads/photos/${req.file.filename}`;
    db.query('INSERT INTO photos (user_id, image_path, caption) VALUES (?, ?, ?)',
        [req.session.userId, imagePath, caption || null], (err) => {
            if (err) {
                console.error(err);
                return res.status(500).send('Failed to save photo.');
            }
            res.redirect('/gallery');
        });
});

app.get('/logout', (req, res) => {
    req.session.destroy();
    res.redirect('/');
});

// ========================================
// ADMIN ROUTES (Protected by isAdmin middleware)
// ========================================
app.get('/admin/dashboard', isAdmin, (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'admin-dashboard.html'));
});

// Redirect old /admin route to login (no separate admin login page)
app.get('/admin', (req, res) => {
    res.redirect('/login');
});

app.get('/api/admin/users', isAdmin, (req, res) => {
    db.query('SELECT id, email, name, gender, age, profile_pic, is_verified, created_at FROM users ORDER BY created_at DESC', (err, results) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json(results);
    });
});

app.get('/api/admin/photos', isAdmin, (req, res) => {
    const sql = `
        SELECT photos.id, photos.image_path, photos.caption, photos.uploaded_at,
               users.name AS uploader_name, users.email AS uploader_email
        FROM photos 
        JOIN users ON photos.user_id = users.id
        ORDER BY photos.uploaded_at DESC
    `;
    db.query(sql, (err, results) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        res.json(results);
    });
});

app.delete('/api/admin/users/:id', isAdmin, (req, res) => {
    const userId = req.params.id;
    
    db.query('SELECT image_path FROM photos WHERE user_id = ?', [userId], (err, photos) => {
        if (err) return res.status(500).json({ error: 'Database error' });
        photos.forEach(photo => {
            const filePath = path.join(__dirname, photo.image_path);
            if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        });
        db.query('DELETE FROM users WHERE id = ?', [userId], (err) => {
            if (err) return res.status(500).json({ error: 'Failed to delete user' });
            res.json({ message: 'User deleted successfully' });
        });
    });
});

app.delete('/api/admin/photos/:id', isAdmin, (req, res) => {
    const photoId = req.params.id;
    
    db.query('SELECT image_path FROM photos WHERE id = ?', [photoId], (err, results) => {
        if (err || results.length === 0) return res.status(500).json({ error: 'Photo not found' });
        const filePath = path.join(__dirname, results[0].image_path);
        if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
        db.query('DELETE FROM photos WHERE id = ?', [photoId], (err) => {
            if (err) return res.status(500).json({ error: 'Failed to delete photo' });
            res.json({ message: 'Photo deleted successfully' });
        });
    });
});

app.get('/api/admin/stats', isAdmin, (req, res) => {
    Promise.all([
        db.promise().query('SELECT COUNT(*) AS total FROM users'),
        db.promise().query('SELECT COUNT(*) AS total FROM photos')
    ]).then(([users, photos]) => {
        res.json({ totalUsers: users[0][0].total, totalPhotos: photos[0][0].total });
    }).catch(() => res.status(500).json({ error: 'DB error' }));
});

// ========================================
// ERROR HANDLING MIDDLEWARE
// ========================================
app.use((err, req, res, next) => {
    console.error('Error:', err.message);
    if (err instanceof multer.MulterError) {
        if (err.code === 'FILE_TOO_LARGE') {
            return res.status(400).send('File too large. Max size: 5MB for photos, 2MB for profile pictures.');
        }
    }
    res.status(500).send('Something went wrong!');
});

// Clean up temp files periodically (every hour)
setInterval(() => {
    const tempDir = path.join(__dirname, 'uploads/temp_profiles');
    if (fs.existsSync(tempDir)) {
        const files = fs.readdirSync(tempDir);
        const now = Date.now();
        files.forEach(file => {
            const filePath = path.join(tempDir, file);
            const stats = fs.statSync(filePath);
            if (now - stats.mtimeMs > 3600000) {
                fs.unlinkSync(filePath);
                console.log(`Cleaned up temp file: ${file}`);
            }
        });
    }
}, 3600000);

// ========================================
// START SERVER
// ========================================
async function startServer() {
    console.log('\n========================================');
    console.log('Starting YourGallery Server...');
    console.log('========================================\n');
    
    const dbConnected = await testDatabaseConnection();
    if (!dbConnected) {
        console.log('Continuing with connection retry...\n');
    }
    
    const tablesCreated = await initializeDatabase();
    
    if (!tablesCreated) {
        console.error('Failed to initialize database. Please check your .env configuration.');
        process.exit(1);
    }
    
    app.listen(PORT, () => {
        console.log(`\n========================================`);
        console.log(`SERVER RUNNING SUCCESSFULLY`);
        console.log(`========================================`);
        console.log(`Main website:  http://localhost:${PORT}`);
        console.log(`Login page:    http://localhost:${PORT}/login`);
        console.log(`Admin access:  Login with admin credentials at /login`);
        console.log(`Email service: ${process.env.EMAIL_HOST ? 'Configured' : 'Not configured'}`);
        console.log(`Backup interval: Every ${BACKUP_INTERVAL_HOURS} hours`);
        console.log(`Database: Cloud MySQL (SSL Enabled)`);
        console.log(`========================================\n`);
    });
}

process.on('SIGINT', () => {
    console.log('\n\nShutting down server...');
    process.exit();
});

startServer();