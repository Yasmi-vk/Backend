const express = require("express");
const path = require("path");
const fs = require("fs");
const { MongoClient, ObjectId } = require("mongodb");

const app = express();

app.use(express.json());

const PORT = process.env.PORT || 3000;
app.set("port", PORT);

// ----------------- LOGGER -----------------
app.use((req, res, next) => {
  const now = new Date().toISOString();
  console.log(`[${now}] ${req.method} ${req.url}`);
  if (Object.keys(req.body || {}).length > 0) {
    console.log("  Body:", req.body);
  }
  next();
});

// ----------------- CORS -----------------
app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET,HEAD,OPTIONS,POST,PUT"
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Origin,Accept, X-Requested-With, Content-Type, Access-Control-Request-Method, Access-Control-Request-Headers"
  );
  next();
});

// Preflight handler for ALL OPTIONS requests
app.use((req, res, next) => {
  if (req.method === "OPTIONS") return res.sendStatus(200);
  next();
});

// ----------------- STATIC IMAGES -----------------
app.get("/images/:imageName", (req, res) => {
  const filePath = path.join(__dirname, "images", req.params.imageName);

  fs.access(filePath, fs.constants.F_OK, (err) => {
    if (err) return res.status(404).json({ error: "Image not found" });
    res.sendFile(filePath);
  });
});

// ----------------- MONGODB CONNECTION -----------------
 const mongoUri =
 process.env.MONGO_URI ||
 "mongodb+srv://yasmidb:y1234@cluster0.zgmyzli.mongodb.net/webstore?retryWrites=true&w=majority";
 

let db = null;
let client = null;

async function connectToMongo() {
  try {
    console.log("Connecting to MongoDB Atlas...");
    client = await MongoClient.connect(mongoUri);
    db = client.db("webstore");
    console.log("✅ Connected to MongoDB (webstore)");
  } catch (err) {
    console.error("❌ MongoDB Connection Error:", err.message);
    throw err;
  }
}

function ensureDb(req, res, next) {
  if (!db) {
    console.error("DB not ready yet");
    return res.status(503).json({ error: "DB not ready" });
  }
  next();
}

// ----------------- ROUTES -----------------

// Root
app.get("/", (req, res) => {
  res.send("API running. Try GET /collection/lessons");
});

// GET /collection/lessons  (frontend)
app.get("/collection/lessons", ensureDb, (req, res, next) => {
  db.collection("lessons")
    .find({})
    .toArray((err, results) => {
      if (err) return next(err);
      res.json(results);
    });
});

// PUT /collection/lessons/:id  - update lesson (spaces, etc.)
app.put("/collection/lessons/:id", ensureDb, (req, res, next) => {
  const param = req.params.id;
  let filter = null;

  if (ObjectId.isValid(param)) {
    filter = { _id: new ObjectId(param) };
  } else {
    const num = parseInt(param, 10);
    if (!Number.isNaN(num)) filter = { id: num };
  }

  if (!filter) {
    return res.status(400).json({ error: "Invalid lesson ID" });
  }

  db.collection("lessons").updateOne(
    filter,
    { $set: req.body },
    (err, result) => {
      if (err) return next(err);
      if (!result.matchedCount) {
        return res.status(404).json({ msg: "Lesson not found" });
      }
      res.json({ msg: "success", modified: result.modifiedCount });
    }
  );
});

// Insert order helper
function insertOrder(req, res, next) {
  const order = req.body || {};

  const items = Array.isArray(order.lessons)
    ? order.lessons
    : Array.isArray(order.cart)
    ? order.cart
    : null;

  if (!order.name || !order.phone || !items) {
    return res.status(400).json({
      error:
        "Invalid order. Provide {name, phone, lessons:[{id,qty}]} or {cart:[...]}"
    });
  }

  order.lessons = items;
  if (order.cart) delete order.cart;

  db.collection("orders").insertOne(order, (err, result) => {
    if (err) return next(err);
    console.log("Order inserted:", result.insertedId);
    res
      .status(201)
      .json({ message: "Order Saved", orderId: result.insertedId });
  });
}

// POST /orders  (coursework spec)
app.post("/orders", ensureDb, insertOrder);

// POST /collection/orders  (frontend)
app.post("/collection/orders", ensureDb, insertOrder);

// GET /orders (view orders)
app.get("/orders", ensureDb, (req, res, next) => {
  db.collection("orders")
    .find({})
    .toArray((err, results) => {
      if (err) return next(err);
      res.json(results);
    });
});

// ----------------- ERROR HANDLERS -----------------
app.use((err, req, res, next) => {
  console.error("SERVER ERROR:", err);
  res.status(500).json({ error: "Internal Server Error" });
});

app.use((req, res) => {
  res.status(404).json({ error: "Route not found" });
});

// ----------------- START SERVER AFTER DB CONNECTS -----------------
connectToMongo()
  .then(() => {
    app.listen(app.get("port"), () => {
      console.log(`Server running on http://localhost:${app.get("port")}`);
    });
  })
  .catch(() => {
    console.error(
      "Failed to connect to MongoDB. Server NOT started. Check your Atlas settings / URI."
    );
  });
