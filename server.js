const express = require("express");
const cors = require("cors");
const mysql = require("mysql2");

const app = express();

// Middleware
app.use(cors({
  origin: [
    'http://localhost:3000',
    'https://your-bakery-app.netlify.app' // Replace with your actual Netlify URL
  ],
  credentials: true
}));
app.use(express.json());

// Database connection for Railway
const dbConfig = {
  host: process.env.MYSQLHOST || process.env.DB_HOST || "localhost",
  user: process.env.MYSQLUSER || process.env.DB_USER || "root",
  password: process.env.MYSQLPASSWORD || process.env.DB_PASSWORD || "",
  database: process.env.MYSQLDATABASE || process.env.DB_NAME || "bakery",
  port: process.env.MYSQLPORT || process.env.DB_PORT || 3306
};

console.log('Database config:', {
  host: dbConfig.host,
  user: dbConfig.user,
  database: dbConfig.database,
  port: dbConfig.port
});

const db = mysql.createConnection(dbConfig);

// Connect to database
db.connect((err) => {
  if (err) {
    console.error("❌ Database connection failed:", err.message);
    console.log("Retrying connection in 5 seconds...");
    setTimeout(() => {
      db.connect((retryErr) => {
        if (retryErr) {
          console.error("❌ Retry failed:", retryErr.message);
        } else {
          console.log("✅ Connected to MySQL database on retry");
          initializeDatabase();
        }
      });
    }, 5000);
  } else {
    console.log("✅ Connected to MySQL database:", dbConfig.database);
    initializeDatabase();
  }
});

// Initialize database tables
function initializeDatabase() {
  const createTableQuery = `
    CREATE TABLE IF NOT EXISTS orders (
      id INT AUTO_INCREMENT PRIMARY KEY,
      order_id VARCHAR(50) NOT NULL UNIQUE,
      customer_name VARCHAR(100) NOT NULL,
      contact_number VARCHAR(20),
      item VARCHAR(100) NOT NULL,
      quantity INT NOT NULL,
      order_date DATE NOT NULL,
      status ENUM('Pending', 'Completed') DEFAULT 'Pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `;

  db.query(createTableQuery, (err) => {
    if (err) {
      console.error("Error creating table:", err);
    } else {
      console.log("✅ Orders table ready");
      
      // Insert sample data if table is empty
      db.query("SELECT COUNT(*) as count FROM orders", (err, results) => {
        if (!err && results[0].count === 0) {
          const sampleData = [
            ['ORD001', 'John Smith', '123-456-7890', 'Cake', 2, '2024-01-15', 'Completed'],
            ['ORD002', 'Emma Johnson', '123-456-7891', 'Bread', 5, '2024-01-16', 'Pending'],
            ['ORD003', 'Michael Brown', '123-456-7892', 'Muffin', 12, '2024-01-16', 'Pending']
          ];
          
          const insertQuery = "INSERT IGNORE INTO orders (order_id, customer_name, contact_number, item, quantity, order_date, status) VALUES ?";
          
          db.query(insertQuery, [sampleData], (err) => {
            if (err) {
              console.error("Error inserting sample data:", err);
            } else {
              console.log("✅ Sample data inserted");
            }
          });
        }
      });
    }
  });
}

// Health check endpoint
app.get("/", (req, res) => {
  res.json({ 
    message: "Bakery Order Management API", 
    status: "Running",
    database: "MySQL",
    timestamp: new Date().toISOString()
  });
});

app.get("/api/health", (req, res) => {
  db.query("SELECT 1 as health", (err, results) => {
    if (err) {
      res.status(500).json({ 
        status: "ERROR", 
        database: "Disconnected",
        error: err.message 
      });
    } else {
      res.json({ 
        status: "OK", 
        database: "Connected",
        timestamp: new Date().toISOString()
      });
    }
  });
});

// GET all orders
app.get("/api/orders", (req, res) => {
  const query = "SELECT * FROM orders ORDER BY order_date DESC, created_at DESC";
  
  db.query(query, (err, results) => {
    if (err) {
      console.error("Database error:", err);
      res.status(500).json({ error: "Database error: " + err.message });
    } else {
      res.json(results);
    }
  });
});

// POST new order
app.post("/api/orders", (req, res) => {
  const { order_id, customer_name, contact_number, item, quantity, order_date, status } = req.body;
  
  // Validate required fields
  if (!order_id || !customer_name || !item || !quantity) {
    return res.status(400).json({ error: "Missing required fields: order_id, customer_name, item, quantity" });
  }

  if (isNaN(quantity) || quantity < 1) {
    return res.status(400).json({ error: "Quantity must be a number greater than 0" });
  }

  const query = `
    INSERT INTO orders (order_id, customer_name, contact_number, item, quantity, order_date, status) 
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `;
  
  const values = [
    order_id,
    customer_name,
    contact_number || '',
    item,
    parseInt(quantity),
    order_date || new Date().toISOString().split('T')[0],
    status || 'Pending'
  ];

  db.query(query, values, (err, result) => {
    if (err) {
      if (err.code === 'ER_DUP_ENTRY') {
        return res.status(409).json({ error: "Order ID already exists" });
      }
      console.error("Insert error:", err);
      res.status(500).json({ error: "Failed to create order: " + err.message });
    } else {
      // Return the created order
      const getOrderQuery = "SELECT * FROM orders WHERE id = ?";
      db.query(getOrderQuery, [result.insertId], (err, orderResults) => {
        if (err) {
          res.json({ 
            message: "Order created successfully", 
            orderId: result.insertId 
          });
        } else {
          res.json({ 
            message: "Order created successfully", 
            order: orderResults[0] 
          });
        }
      });
    }
  });
});

// UPDATE order status
app.put("/api/orders/:id", (req, res) => {
  const orderId = req.params.id;
  const { status } = req.body;

  if (!status || !['Pending', 'Completed'].includes(status)) {
    return res.status(400).json({ error: "Invalid status. Must be 'Pending' or 'Completed'" });
  }

  const query = "UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?";
  
  db.query(query, [status, orderId], (err, result) => {
    if (err) {
      console.error("Update error:", err);
      res.status(500).json({ error: "Failed to update order: " + err.message });
    } else if (result.affectedRows === 0) {
      res.status(404).json({ error: "Order not found" });
    } else {
      res.json({ message: "Order status updated successfully" });
    }
  });
});

// DELETE order
app.delete("/api/orders/:id", (req, res) => {
  const orderId = req.params.id;
  
  // First get the order to return it in response
  const getQuery = "SELECT * FROM orders WHERE id = ?";
  
  db.query(getQuery, [orderId], (err, results) => {
    if (err) {
      console.error("Select error:", err);
      return res.status(500).json({ error: "Database error: " + err.message });
    }
    
    if (results.length === 0) {
      return res.status(404).json({ error: "Order not found" });
    }
    
    const deletedOrder = results[0];
    
    // Now delete the order
    const deleteQuery = "DELETE FROM orders WHERE id = ?";
    
    db.query(deleteQuery, [orderId], (err, result) => {
      if (err) {
        console.error("Delete error:", err);
        res.status(500).json({ error: "Failed to delete order: " + err.message });
      } else {
        res.json({ 
          message: "Order deleted successfully",
          deletedOrder: deletedOrder
        });
      }
    });
  });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
  console.log(`🌍 Environment: ${process.env.NODE_ENV || 'development'}`);
});