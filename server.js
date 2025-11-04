const express = require("express");
const cors = require("cors");
const mysql = require("mysql2");

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Database connection
const db = mysql.createConnection({
  host: "localhost",
  user: "root",
  password: "",
  database: "bakery"
});

db.connect((err) => {
  if (err) {
    console.error("❌ Database connection failed:", err);
  } else {
    console.log("✅ Connected to MySQL bakery database");
  }
});

// GET all orders
app.get("/api/orders", (req, res) => {
  const query = "SELECT * FROM orders ORDER BY order_date DESC, created_at DESC";
  
  db.query(query, (err, results) => {
    if (err) {
      console.error("Database error:", err);
      res.status(500).json({ error: "Database error" });
    } else {
      res.json(results);
    }
  });
});

// POST new order - FIXED VALIDATION
app.post("/api/orders", (req, res) => {
  const { order_id, customer_name, contact_number, item, quantity, order_date, status } = req.body;
  
  // Validate required fields
  if (!order_id || !customer_name || !item || !quantity) {
    return res.status(400).json({ error: "Missing required fields: order_id, customer_name, item, quantity" });
  }

  // FIXED: Remove the ! from isNaN
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
      res.status(500).json({ error: "Failed to create order" });
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
      res.status(500).json({ error: "Failed to update order" });
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
      return res.status(500).json({ error: "Database error" });
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
        res.status(500).json({ error: "Failed to delete order" });
      } else {
        res.json({ 
          message: "Order deleted successfully",
          deletedOrder: deletedOrder
        });
      }
    });
  });
});

const PORT = 5000;
app.listen(PORT, () => {
  console.log(`🚀 Backend server running on http://localhost:${PORT}`);
});