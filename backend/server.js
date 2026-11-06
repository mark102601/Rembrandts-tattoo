
const express = require('express');
const cors = require('cors');
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const nodemailer = require('nodemailer');
const crypto = require('crypto');
require('dotenv').config();

const app = express();
const PORT = process.env.PORT || 5000;
const JWT_SECRET = process.env.JWT_SECRET;

if (!JWT_SECRET) {
  console.error('JWT_SECRET is missing. Please check your backend/.env file.');
  process.exit(1);
}

if (!process.env.GMAIL_USER || !process.env.GMAIL_APP_PASSWORD) {
  console.error('GMAIL_USER or GMAIL_APP_PASSWORD is missing in backend/.env.');
  process.exit(1);
}

app.use(cors());
app.use(express.json({ limit: '1mb' }));

// =========================
// GMAIL CONFIGURATION
// =========================

const FRONTEND_URL =
  process.env.FRONTEND_URL || 'http://localhost:5173';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.GMAIL_USER,
    pass: process.env.GMAIL_APP_PASSWORD
  }
});

// =========================
// IMAGE UPLOAD CONFIGURATION
// =========================

const uploadDir = path.join(__dirname, 'uploads');

if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

app.use('/uploads', express.static(uploadDir));

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const extension = path.extname(file.originalname).toLowerCase();
    const filename = `tattoo-${Date.now()}-${Math.round(Math.random() * 1e9)}${extension}`;
    cb(null, filename);
  }
});

const upload = multer({
  storage,
  limits: {
    fileSize: 5 * 1024 * 1024
  },
  fileFilter: (req, file, cb) => {
    const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];

    if (allowedTypes.includes(file.mimetype)) {
      cb(null, true);
    } else {
      cb(new Error('Only JPG, PNG, and WEBP images are allowed.'));
    }
  }
});

// =========================
// MYSQL CONNECTION
// =========================

const pool = mysql.createPool({
  host: process.env.DB_HOST || 'localhost',
  user: process.env.DB_USER || 'root',
  password: process.env.DB_PASSWORD || '',
  database: process.env.DB_NAME || 'rembrandts_tattoo',
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// =========================
// HELPER FUNCTIONS
// =========================

const isFilled = value =>
  typeof value === 'string' && value.trim().length > 0;

const isValidId = value =>
  Number.isInteger(Number(value)) && Number(value) > 0;

function serverError(res, error, message) {
  console.error(message, error);
  return res.status(500).json({ error: message });
}

// Escape user-provided text before inserting it into HTML email.
function escapeHtml(value) {
  return String(value || '').replace(/[&<>"']/g, character => {
    const entities = {
      '&': '&amp;',
      '<': '&lt;',
      '>': '&gt;',
      '"': '&quot;',
      "'": '&#39;'
    };

    return entities[character];
  });
}

// =========================
// JWT AUTHENTICATION
// =========================

function authenticateToken(req, res, next) {
  const authHeader = req.headers.authorization;
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({
      error: 'Authentication required. Please log in.'
    });
  }

  jwt.verify(token, JWT_SECRET, (error, user) => {
    if (error) {
      return res.status(401).json({
        error: 'Invalid or expired token. Please log in again.'
      });
    }

    req.user = user;
    next();
  });
}

function requireAdmin(req, res, next) {
  if (req.user.role !== 'Admin') {
    return res.status(403).json({
      error: 'Admin access only.'
    });
  }

  next();
}

// =========================
// HEALTH CHECK
// =========================

app.get('/api/health', async (req, res) => {
  try {
    await pool.query('SELECT 1');

    res.json({
      ok: true,
      message: 'Backend and MySQL connected'
    });
  } catch (error) {
    serverError(res, error, 'Database connection failed.');
  }
});

// =========================
// APPOINTMENTS: GET
// =========================

app.get('/api/appointments', authenticateToken, async (req, res) => {
  try {
    let query = `
      SELECT
        a.id,
        a.customer_id,
        a.customer_name,
        a.contact_number,
        a.tattoo_preference,
        a.appointment_date,
        a.appointment_time,
        a.notes,
        a.tattoo_image,
        a.status,
        a.created_at
      FROM appointments a
    `;

    const params = [];

    if (req.user.role !== 'Admin') {
      query += `
        INNER JOIN customers c ON a.customer_id = c.id
        WHERE c.email = ?
      `;

      params.push(req.user.email);
    }

    query += `
      ORDER BY a.appointment_date ASC, a.appointment_time ASC
    `;

    const [rows] = await pool.query(query, params);
    res.json(rows);
  } catch (error) {
    serverError(res, error, 'Unable to load appointments.');
  }
});

// =========================
// APPOINTMENTS: CREATE
// WITH IMAGE UPLOAD
// =========================

app.post(
  '/api/appointments',
  authenticateToken,
  upload.single('design_image'),
  async (req, res) => {
    const {
      customer_id,
      name,
      contact,
      tattoo,
      appointment_date,
      appointment_time,
      notes
    } = req.body;

    try {
      if (
        !isFilled(contact) ||
        !isFilled(tattoo) ||
        !isFilled(appointment_date) ||
        !isFilled(appointment_time)
      ) {
        return res.status(400).json({
          error: 'Please complete all required appointment fields.'
        });
      }

      if (!/^\d{4}-\d{2}-\d{2}$/.test(appointment_date)) {
        return res.status(400).json({
          error: 'Invalid appointment date.'
        });
      }

      if (!/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/.test(appointment_time)) {
        return res.status(400).json({
          error: 'Invalid appointment time.'
        });
      }

      const [dateCheck] = await pool.query(
        `SELECT DATE_FORMAT(?, '%Y-%m-%d') AS checked_date`,
        [appointment_date]
      );

      if (dateCheck[0].checked_date !== appointment_date) {
        return res.status(400).json({
          error: 'Invalid calendar date.'
        });
      }

      const [pastCheck] = await pool.query(
        `SELECT (
          ? < CURDATE()
          OR (? = CURDATE() AND CAST(? AS TIME) <= CURTIME())
        ) AS is_past`,
        [appointment_date, appointment_date, appointment_time]
      );

      if (Number(pastCheck[0].is_past) === 1) {
        return res.status(400).json({
          error: 'Choose a future appointment date and time.'
        });
      }

      const normalizedTime = appointment_time.length === 5
        ? `${appointment_time}:00`
        : appointment_time;

      const [existing] = await pool.query(
        `SELECT id
         FROM appointments
         WHERE appointment_date = ?
           AND appointment_time = ?
           AND status <> 'Rejected'
         LIMIT 1`,
        [appointment_date, normalizedTime]
      );

      if (existing.length > 0) {
        return res.status(409).json({
          error: 'This date and time is already booked. Choose another time.'
        });
      }

      let finalCustomerId = null;
      let finalName = '';
      let finalContact = contact.trim();

      if (req.user.role === 'Customer') {
        finalName = req.user.name;

        const [customers] = await pool.query(
          'SELECT id FROM customers WHERE email = ? LIMIT 1',
          [req.user.email]
        );

        if (customers.length) {
          finalCustomerId = customers[0].id;

          await pool.query(
            `UPDATE customers
             SET name = ?, contact_number = ?
             WHERE id = ?`,
            [finalName, finalContact, finalCustomerId]
          );
        } else {
          const [created] = await pool.query(
            `INSERT INTO customers (name, contact_number, email)
             VALUES (?, ?, ?)`,
            [finalName, finalContact, req.user.email]
          );

          finalCustomerId = created.insertId;
        }
      } else {
        if (!isFilled(name)) {
          return res.status(400).json({
            error: 'Customer name is required.'
          });
        }

        finalName = name.trim();

        if (customer_id !== undefined && customer_id !== null && customer_id !== '') {
          if (!isValidId(customer_id)) {
            return res.status(400).json({
              error: 'Invalid customer ID.'
            });
          }

          const [customers] = await pool.query(
            'SELECT id FROM customers WHERE id = ?',
            [Number(customer_id)]
          );

          if (!customers.length) {
            return res.status(400).json({
              error: 'Customer record not found.'
            });
          }

          finalCustomerId = Number(customer_id);

          await pool.query(
            `UPDATE customers
             SET name = ?, contact_number = ?
             WHERE id = ?`,
            [finalName, finalContact, finalCustomerId]
          );
        }
      }

      const imagePath = req.file
        ? `/uploads/${req.file.filename}`
        : null;

      const [result] = await pool.query(
        `INSERT INTO appointments
         (
           customer_id,
           customer_name,
           contact_number,
           tattoo_preference,
           appointment_date,
           appointment_time,
           notes,
           tattoo_image,
           status
         )
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, 'Pending')`,
        [
          finalCustomerId,
          finalName,
          finalContact,
          tattoo.trim(),
          appointment_date,
          normalizedTime,
          isFilled(notes) ? notes.trim() : null,
          imagePath
        ]
      );

      res.status(201).json({
        id: result.insertId,
        message: 'Appointment created successfully.',
        tattoo_image: imagePath
      });
    } catch (error) {
      serverError(res, error, 'Unable to create appointment.');
    }
  }
);

// =========================
// APPOINTMENTS: APPROVE / REJECT
// =========================

app.patch(
  '/api/appointments/:id/status',
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    const { id } = req.params;
    const { status } = req.body;

    if (!isValidId(id)) {
      return res.status(400).json({
        error: 'Invalid appointment ID.'
      });
    }

    if (!['Approved', 'Rejected'].includes(status)) {
      return res.status(400).json({
        error: 'Status must be Approved or Rejected.'
      });
    }

    try {
      if (status === 'Approved') {
        const [appointment] = await pool.query(
          `SELECT appointment_date, appointment_time
           FROM appointments
           WHERE id = ?`,
          [Number(id)]
        );

        if (!appointment.length) {
          return res.status(404).json({
            error: 'Appointment not found.'
          });
        }

        const item = appointment[0];

        const [conflicts] = await pool.query(
          `SELECT id
           FROM appointments
           WHERE appointment_date = ?
             AND appointment_time = ?
             AND status = 'Approved'
             AND id <> ?
           LIMIT 1`,
          [
            item.appointment_date,
            item.appointment_time,
            Number(id)
          ]
        );

        if (conflicts.length) {
          return res.status(409).json({
            error: 'Another appointment is already approved for this time.'
          });
        }
      }

      const [result] = await pool.query(
        'UPDATE appointments SET status = ? WHERE id = ?',
        [status, Number(id)]
      );

      if (!result.affectedRows) {
        return res.status(404).json({
          error: 'Appointment not found.'
        });
      }

      res.json({
        message: `Appointment ${status.toLowerCase()}.`
      });
    } catch (error) {
      serverError(res, error, 'Unable to update appointment status.');
    }
  }
);

// =========================
// CUSTOMERS: GET
// =========================

app.get(
  '/api/customers',
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const [rows] = await pool.query(
        `SELECT id, name, contact_number, email, created_at
         FROM customers
         ORDER BY id DESC`
      );

      res.json(rows);
    } catch (error) {
      serverError(res, error, 'Unable to load customers.');
    }
  }
);

// =========================
// CUSTOMERS: CREATE
// =========================

app.post(
  '/api/customers',
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    const { name, contact_number, email } = req.body;

    if (!isFilled(name) || !isFilled(contact_number)) {
      return res.status(400).json({
        error: 'Customer name and contact number are required.'
      });
    }

    try {
      const [result] = await pool.query(
        `INSERT INTO customers (name, contact_number, email)
         VALUES (?, ?, ?)`,
        [
          name.trim(),
          contact_number.trim(),
          isFilled(email) ? email.trim() : null
        ]
      );

      res.status(201).json({
        id: result.insertId,
        message: 'Customer created successfully.'
      });
    } catch (error) {
      serverError(res, error, 'Unable to create customer.');
    }
  }
);

// =========================
// PROJECTS: EDIT DETAILS
// =========================

app.put(
  '/api/projects/:id',
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const { id } = req.params;

      const {
        customer_id,
        design_details,
        total_price,
        status,
        progress,
        notes
      } = req.body;

      if (
        !customer_id ||
        !design_details ||
        total_price === undefined ||
        !status ||
        progress === undefined
      ) {
        return res.status(400).json({
          message: 'Please complete all required project fields.'
        });
      }

      const customerId = Number(customer_id);
      const price = Number(total_price);
      const projectProgress = Number(progress);

      if (!Number.isInteger(customerId) || customerId <= 0) {
        return res.status(400).json({
          message: 'Invalid customer selected.'
        });
      }

      if (!Number.isFinite(price) || price < 0) {
        return res.status(400).json({
          message: 'Invalid total price.'
        });
      }

      if (
        !Number.isInteger(projectProgress) ||
        projectProgress < 0 ||
        projectProgress > 100
      ) {
        return res.status(400).json({
          message: 'Progress must be between 0 and 100.'
        });
      }

      const [result] = await pool.query(
        `UPDATE tattoo_projects
         SET customer_id = ?,
             design_details = ?,
             total_price = ?,
             status = ?,
             progress = ?,
             notes = ?
         WHERE id = ?`,
        [
          customerId,
          design_details,
          price,
          status,
          projectProgress,
          notes || '',
          id
        ]
      );

      if (result.affectedRows === 0) {
        return res.status(404).json({
          message: 'Tattoo project not found.'
        });
      }

      res.json({
        message: 'Tattoo project updated successfully.'
      });
    } catch (error) {
      console.error('Update project error:', error);

      res.status(500).json({
        message: 'Failed to update tattoo project.'
      });
    }
  }
);

// =========================
// CUSTOMERS: DELETE
// =========================

app.delete(
  '/api/customers/:id',
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({
        error: 'Invalid customer ID.'
      });
    }

    try {
      const [result] = await pool.query(
        'DELETE FROM customers WHERE id = ?',
        [Number(id)]
      );

      if (!result.affectedRows) {
        return res.status(404).json({
          error: 'Customer not found.'
        });
      }

      res.json({
        message: 'Customer deleted successfully.'
      });
    } catch (error) {
      if (error.code === 'ER_ROW_IS_REFERENCED_2') {
        return res.status(409).json({
          error: 'This customer has existing appointments or projects and cannot be deleted.'
        });
      }

      serverError(res, error, 'Unable to delete customer.');
    }
  }
);

// =========================
// REGISTER
// =========================

app.post('/api/register', async (req, res) => {
  const { name, email, password } = req.body;

  if (
    !isFilled(name) ||
    !isFilled(email) ||
    !isFilled(password)
  ) {
    return res.status(400).json({
      error: 'Name, email, and password are required.'
    });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) {
    return res.status(400).json({
      error: 'Enter a valid email address.'
    });
  }

  if (password.length < 6) {
    return res.status(400).json({
      error: 'Password must be at least 6 characters.'
    });
  }

  try {
    const [existing] = await pool.query(
      'SELECT id FROM users WHERE email = ? LIMIT 1',
      [email.trim()]
    );

    if (existing.length) {
      return res.status(409).json({
        error: 'Email already registered.'
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);

    const [result] = await pool.query(
      `INSERT INTO users (name, email, password, role)
       VALUES (?, ?, ?, 'Customer')`,
      [name.trim(), email.trim(), hashedPassword]
    );

    res.status(201).json({
      id: result.insertId,
      message: 'Registration successful.'
    });
  } catch (error) {
    serverError(res, error, 'Unable to register account.');
  }
});

// =========================
// LOGIN
// =========================

app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;

  if (!isFilled(email) || !isFilled(password)) {
    return res.status(400).json({
      error: 'Email and password are required.'
    });
  }

  try {
    const [rows] = await pool.query(
      `SELECT id, name, email, password, role
       FROM users
       WHERE email = ?
       LIMIT 1`,
      [email.trim()]
    );

    if (!rows.length) {
      return res.status(401).json({
        error: 'Invalid email or password.'
      });
    }

    const account = rows[0];
    const storedPassword = account.password;
    let matches = false;

    if (
      typeof storedPassword === 'string' &&
      storedPassword.startsWith('$2')
    ) {
      matches = await bcrypt.compare(password, storedPassword);
    } else {
      matches = password === storedPassword;

      if (matches) {
        const hash = await bcrypt.hash(password, 10);

        await pool.query(
          'UPDATE users SET password = ? WHERE id = ?',
          [hash, account.id]
        );
      }
    }

    if (!matches) {
      return res.status(401).json({
        error: 'Invalid email or password.'
      });
    }

    const user = {
      id: account.id,
      name: account.name,
      email: account.email,
      role: account.role
    };

    const token = jwt.sign(
      user,
      JWT_SECRET,
      { expiresIn: '8h' }
    );

    res.json({
      message: 'Login successful.',
      user,
      token
    });
  } catch (error) {
    serverError(res, error, 'Unable to log in.');
  }
});

// =========================
// FORGOT PASSWORD - GMAIL
// =========================

app.post('/api/forgot-password', async (req, res) => {
  const { email } = req.body;

  if (!isFilled(email)) {
    return res.status(400).json({
      error: 'Please enter your email address.'
    });
  }

  try {
    const normalizedEmail = email.trim().toLowerCase();

    const [users] = await pool.query(
      `SELECT id, name, email
       FROM users
       WHERE LOWER(email) = ?
       LIMIT 1`,
      [normalizedEmail]
    );

    const responseMessage =
      'If this email is registered, a password reset link will be sent.';

    if (!users.length) {
      return res.json({ message: responseMessage });
    }

    const account = users[0];

    const resetToken = crypto.randomBytes(32).toString('hex');

    const tokenHash = crypto
      .createHash('sha256')
      .update(resetToken)
      .digest('hex');

    // Invalidate previous unused reset links.
    await pool.query(
      `UPDATE password_resets
       SET used_at = NOW()
       WHERE user_id = ?
         AND used_at IS NULL`,
      [account.id]
    );

    // Save the hashed token. The original token is sent by email only.
    await pool.query(
      `INSERT INTO password_resets
       (user_id, method, token_hash, expires_at)
       VALUES (?, 'email', ?, DATE_ADD(NOW(), INTERVAL 15 MINUTE))`,
      [account.id, tokenHash]
    );

    const resetLink =
      `${FRONTEND_URL}/reset-password?token=${resetToken}`;

    const safeName = escapeHtml(account.name);

    await transporter.sendMail({
      from: `"Rembrandts Tattoo" <${process.env.GMAIL_USER}>`,
      to: account.email,
      subject: 'Reset Your Rembrandts Tattoo Password',
      text: `Hello ${account.name},

We received a request to reset your password.

Use this link to create a new password:

${resetLink}

This link will expire in 15 minutes and can only be used once.

If you did not request this, you can ignore this email.

Rembrandts Tattoo`,
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 600px; margin: auto;">
          <h2>Rembrandts Tattoo</h2>
          <h3>Password Reset Request</h3>
          <p>Hello ${safeName},</p>
          <p>We received a request to reset your password.</p>
          <p>Click the button below to create a new password:</p>
          <p>
            <a
              href="${resetLink}"
              style="
                display: inline-block;
                padding: 12px 20px;
                background: #171717;
                color: #ffffff;
                text-decoration: none;
                border-radius: 5px;
              "
            >
              Reset My Password
            </a>
          </p>
          <p>This link expires in 15 minutes and can only be used once.</p>
          <p>If you did not request this, you can ignore this email.</p>
          <p>Rembrandts Tattoo</p>
        </div>
      `
    });

    return res.json({ message: responseMessage });

  } catch (error) {
    console.error('Forgot password error:', error);

    return res.status(500).json({
      error: 'Unable to send password reset email. Please try again later.'
    });
  }
});

// =========================
// RESET PASSWORD
// =========================

app.post('/api/reset-password', async (req, res) => {
  const { token, newPassword } = req.body;

  if (!isFilled(token) || !isFilled(newPassword)) {
    return res.status(400).json({
      error: 'Reset token and new password are required.'
    });
  }

  if (!/^[a-f0-9]{64}$/i.test(token)) {
    return res.status(400).json({
      error: 'Invalid or expired reset link.'
    });
  }

  if (newPassword.length < 6) {
    return res.status(400).json({
      error: 'Password must be at least 6 characters.'
    });
  }

  let connection;
  let transactionStarted = false;

  try {
    const tokenHash = crypto
      .createHash('sha256')
      .update(token)
      .digest('hex');

    connection = await pool.getConnection();

    await connection.beginTransaction();
    transactionStarted = true;

    const [resetRows] = await connection.query(
      `SELECT id, user_id
       FROM password_resets
       WHERE token_hash = ?
         AND method = 'email'
         AND used_at IS NULL
         AND expires_at > NOW()
       LIMIT 1
       FOR UPDATE`,
      [tokenHash]
    );

    if (!resetRows.length) {
      await connection.rollback();
      transactionStarted = false;

      return res.status(400).json({
        error: 'This reset link is invalid or expired. Please request a new one.'
      });
    }

    const resetRecord = resetRows[0];

    const hashedPassword = await bcrypt.hash(newPassword, 10);

    const [updated] = await connection.query(
      'UPDATE users SET password = ? WHERE id = ?',
      [hashedPassword, resetRecord.user_id]
    );

    if (!updated.affectedRows) {
      await connection.rollback();
      transactionStarted = false;

      return res.status(400).json({
        error: 'Account not found. Please request a new reset link.'
      });
    }

    // Mark all unused reset links for this account as used.
    await connection.query(
      `UPDATE password_resets
       SET used_at = NOW()
       WHERE user_id = ?
         AND used_at IS NULL`,
      [resetRecord.user_id]
    );

    await connection.commit();
    transactionStarted = false;

    return res.json({
      message: 'Password reset successful. You can now log in using your new password.'
    });

  } catch (error) {
    if (connection && transactionStarted) {
      await connection.rollback();
    }

    console.error('Reset password error:', error);

    return res.status(500).json({
      error: 'Unable to reset password. Please try again.'
    });

  } finally {
    if (connection) {
      connection.release();
    }
  }
});

// =========================
// PROJECTS: GET
// =========================

app.get(
  '/api/projects',
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const [rows] = await pool.query(`
        SELECT
          p.*,
          c.name AS customer_name,
          COALESCE(pay.total_paid, 0) AS total_paid,
          GREATEST(
            p.total_price - COALESCE(pay.total_paid, 0),
            0
          ) AS remaining_balance
        FROM tattoo_projects p
        LEFT JOIN customers c
          ON p.customer_id = c.id
        LEFT JOIN (
          SELECT project_id, SUM(amount) AS total_paid
          FROM payments
          WHERE project_id IS NOT NULL
          GROUP BY project_id
        ) pay ON pay.project_id = p.id
        ORDER BY p.id DESC
      `);

      res.json(rows);
    } catch (error) {
      serverError(res, error, 'Unable to load tattoo projects.');
    }
  }
);

// =========================
// PROJECTS: CREATE
// =========================

app.post(
  '/api/projects',
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    const {
      customer_id,
      design_details,
      status,
      progress,
      notes,
      total_price
    } = req.body;

    const allowedStatuses = [
      'Planned',
      'In Progress',
      'Completed',
      'Cancelled'
    ];

    const projectStatus = status || 'Planned';
    const projectProgress = progress === undefined ? 0 : Number(progress);
    const numericPrice = Number(total_price);

    if (!isFilled(design_details)) {
      return res.status(400).json({
        error: 'Design details are required.'
      });
    }

    if (
      total_price === undefined ||
      total_price === null ||
      total_price === '' ||
      !Number.isFinite(numericPrice) ||
      numericPrice < 0
    ) {
      return res.status(400).json({
        error: 'Enter a valid tattoo price.'
      });
    }

    if (!allowedStatuses.includes(projectStatus)) {
      return res.status(400).json({
        error: 'Invalid project status.'
      });
    }

    if (
      !Number.isInteger(projectProgress) ||
      projectProgress < 0 ||
      projectProgress > 100
    ) {
      return res.status(400).json({
        error: 'Progress must be a whole number from 0 to 100.'
      });
    }

    try {
      let finalCustomerId = null;

      if (customer_id !== undefined && customer_id !== null && customer_id !== '') {
        if (!isValidId(customer_id)) {
          return res.status(400).json({
            error: 'Invalid customer ID.'
          });
        }

        const [customers] = await pool.query(
          'SELECT id FROM customers WHERE id = ?',
          [Number(customer_id)]
        );

        if (!customers.length) {
          return res.status(400).json({
            error: 'Customer record not found.'
          });
        }

        finalCustomerId = Number(customer_id);
      }

      const [result] = await pool.query(
        `INSERT INTO tattoo_projects
         (
           customer_id,
           design_details,
           status,
           progress,
           notes,
           total_price
         )
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          finalCustomerId,
          design_details.trim(),
          projectStatus,
          projectProgress,
          isFilled(notes) ? notes.trim() : null,
          numericPrice.toFixed(2)
        ]
      );

      res.status(201).json({
        id: result.insertId,
        message: 'Project created successfully.'
      });
    } catch (error) {
      serverError(res, error, 'Unable to create tattoo project.');
    }
  }
);

// =========================
// PROJECTS: UPDATE STATUS
// SUPPORTS PATCH
// =========================

async function updateProject(req, res) {
  const { id } = req.params;
  const { status, progress, notes } = req.body;

  const allowedStatuses = [
    'Planned',
    'In Progress',
    'Completed',
    'Cancelled'
  ];

  if (!isValidId(id)) {
    return res.status(400).json({
      error: 'Invalid project ID.'
    });
  }

  if (!allowedStatuses.includes(status)) {
    return res.status(400).json({
      error: 'Invalid project status.'
    });
  }

  const numericProgress = Number(progress);

  if (
    !Number.isInteger(numericProgress) ||
    numericProgress < 0 ||
    numericProgress > 100
  ) {
    return res.status(400).json({
      error: 'Progress must be a whole number from 0 to 100.'
    });
  }

  try {
    const [result] = await pool.query(
      `UPDATE tattoo_projects
       SET status = ?, progress = ?, notes = ?
       WHERE id = ?`,
      [
        status,
        numericProgress,
        isFilled(notes) ? notes.trim() : null,
        Number(id)
      ]
    );

    if (!result.affectedRows) {
      return res.status(404).json({
        error: 'Project not found.'
      });
    }

    res.json({
      message: 'Project updated successfully.'
    });
  } catch (error) {
    serverError(res, error, 'Unable to update tattoo project.');
  }
}

app.patch(
  '/api/projects/:id',
  authenticateToken,
  requireAdmin,
  updateProject
);

// =========================
// PROJECTS: DELETE
// =========================

app.delete(
  '/api/projects/:id',
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    const { id } = req.params;

    if (!isValidId(id)) {
      return res.status(400).json({
        error: 'Invalid project ID.'
      });
    }

    try {
      const [projects] = await pool.query(
        'SELECT id FROM tattoo_projects WHERE id = ?',
        [Number(id)]
      );

      if (!projects.length) {
        return res.status(404).json({
          error: 'Project not found.'
        });
      }

      const [payments] = await pool.query(
        `SELECT id
         FROM payments
         WHERE project_id = ?
         LIMIT 1`,
        [Number(id)]
      );

      if (payments.length > 0) {
        return res.status(409).json({
          error: 'This project has payment records. It cannot be deleted.'
        });
      }

      await pool.query(
        'DELETE FROM tattoo_projects WHERE id = ?',
        [Number(id)]
      );

      res.json({
        message: 'Project deleted successfully.'
      });
    } catch (error) {
      if (error.code === 'ER_ROW_IS_REFERENCED_2') {
        return res.status(409).json({
          error: 'This project is connected to existing records and cannot be deleted.'
        });
      }

      serverError(res, error, 'Unable to delete tattoo project.');
    }
  }
);

// =========================
// PAYMENTS: GET
// =========================

app.get(
  '/api/payments',
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    try {
      const [rows] = await pool.query(`
        SELECT
          p.*,
          c.name AS customer_name,
          tp.design_details AS project_name
        FROM payments p
        LEFT JOIN customers c
          ON p.customer_id = c.id
        LEFT JOIN tattoo_projects tp
          ON p.project_id = tp.id
        ORDER BY p.id DESC
      `);

      res.json(rows);
    } catch (error) {
      serverError(res, error, 'Unable to load payments.');
    }
  }
);

// =========================
// PAYMENTS: CREATE
// =========================

app.post(
  '/api/payments',
  authenticateToken,
  requireAdmin,
  async (req, res) => {
    const {
      customer_id,
      project_id,
      amount,
      payment_method,
      payment_type,
      notes
    } = req.body;

    const numericAmount = Number(amount);

    const allowedMethods = ['Cash', 'GCash'];

    const allowedTypes = [
      'Downpayment',
      'Partial Payment',
      'Full Payment'
    ];

    if (
      amount === undefined ||
      amount === null ||
      amount === '' ||
      !Number.isFinite(numericAmount) ||
      numericAmount <= 0
    ) {
      return res.status(400).json({
        error: 'Payment amount must be greater than zero.'
      });
    }

    if (!allowedMethods.includes(payment_method)) {
      return res.status(400).json({
        error: 'Payment method must be Cash or GCash.'
      });
    }

    if (!allowedTypes.includes(payment_type)) {
      return res.status(400).json({
        error: 'Choose Downpayment, Partial Payment, or Full Payment.'
      });
    }

    if (!isValidId(project_id)) {
      return res.status(400).json({
        error: 'Please select a tattoo project for this payment.'
      });
    }

    try {
      const [projects] = await pool.query(
        `SELECT id, customer_id, total_price
         FROM tattoo_projects
         WHERE id = ?`,
        [Number(project_id)]
      );

      if (!projects.length) {
        return res.status(404).json({
          error: 'Tattoo project not found.'
        });
      }

      const project = projects[0];

      if (
        customer_id !== undefined &&
        customer_id !== null &&
        customer_id !== '' &&
        !isValidId(customer_id)
      ) {
        return res.status(400).json({
          error: 'Invalid customer ID.'
        });
      }

      if (
        customer_id !== undefined &&
        customer_id !== null &&
        customer_id !== '' &&
        Number(customer_id) !== Number(project.customer_id)
      ) {
        return res.status(400).json({
          error: 'The selected customer does not match this tattoo project.'
        });
      }

      const finalCustomerId = project.customer_id;

      if (finalCustomerId === null) {
        return res.status(400).json({
          error: 'Assign a customer to this project before recording payment.'
        });
      }

      const [paidRows] = await pool.query(
        `SELECT COALESCE(SUM(amount), 0) AS total_paid
         FROM payments
         WHERE project_id = ?`,
        [Number(project_id)]
      );

      const totalPaid = Number(paidRows[0].total_paid || 0);
      const remaining = Number(project.total_price) - totalPaid;

      if (remaining <= 0) {
        return res.status(400).json({
          error: 'This tattoo project has already been fully paid.'
        });
      }

      if (numericAmount > remaining) {
        return res.status(400).json({
          error: `Payment exceeds the remaining balance of ₱${remaining.toFixed(2)}.`
        });
      }

      const [result] = await pool.query(
        `INSERT INTO payments
         (
           customer_id,
           project_id,
           amount,
           payment_method,
           payment_type,
           notes
         )
         VALUES (?, ?, ?, ?, ?, ?)`,
        [
          finalCustomerId,
          Number(project_id),
          numericAmount.toFixed(2),
          payment_method,
          payment_type,
          isFilled(notes) ? notes.trim() : null
        ]
      );

      res.status(201).json({
        id: result.insertId,
        message: 'Payment recorded successfully.'
      });
    } catch (error) {
      serverError(res, error, 'Unable to record payment.');
    }
  }
);

// =========================
// MULTER ERROR HANDLER
// =========================

app.use((error, req, res, next) => {
  if (error instanceof multer.MulterError) {
    if (error.code === 'LIMIT_FILE_SIZE') {
      return res.status(400).json({
        error: 'Image must not exceed 5 MB.'
      });
    }

    return res.status(400).json({
      error: 'Image upload failed.'
    });
  }

  if (error) {
    return res.status(400).json({
      error: error.message || 'Unable to upload image.'
    });
  }

  next();
});

// =========================
// NOT FOUND
// =========================

app.use((req, res) => {
  res.status(404).json({
    error: 'API route not found.'
  });
});

// =========================
// START SERVER
// =========================

app.listen(PORT, () => {
  console.log(`Backend running on http://localhost:${PORT}`);
});
