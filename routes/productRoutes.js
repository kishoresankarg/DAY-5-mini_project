const express=require('express');
const bcrypt = require("bcryptjs");
const jwt = require("jsonwebtoken");
const Product=require("../models/product");
const auth=require("../middleware/authMiddleware");
const admin=require("../middleware/adminMiddleware");
const User=require("../models/user");
const Order=require("../models/order");
const router=express.Router();


// Unified Signup for both User and Admin
/**
 * @swagger
 * /api/products/signup:
 *   post:
 *     tags:
 *       - Auth
 *     summary: Signup (user or admin)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *               role:
 *                 type: string
 *                 description: "user or admin (defaults to user)"
 *               phone:
 *                 type: string
 *     responses:
 *       201:
 *         description: Signup successful
 *       400:
 *         description: Validation error / user exists
 */
router.post("/signup", async (req, res) => {
  try {
    const { name, email, password, phone, role } = req.body;
    
    if (!name || !email || !password) {
      return res.status(400).json({ message: "Name, email and password are required" });
    }

    // Default role to 'user' if not provided
    const userRole = role && (role === 'admin' || role === 'user') ? role : 'user';

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(400).json({ message: "User with this email already exists" });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const newUser = new User({
      name,
      email,
      password: hashedPassword,
      role: userRole,
      phone: phone || ""
    });

    await newUser.save();

    res.status(201).json({
      message: `${userRole.charAt(0).toUpperCase() + userRole.slice(1)} signup successful. Please login to receive a token.`,
      user: {
        id: newUser._id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});



/**
 * @swagger
 * /api/products/login:
 *   post:
 *     tags:
 *       - Auth
 *     summary: Login (returns JWT)
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *     responses:
 *       200:
 *         description: Login successful
 *       400:
 *         description: Invalid credentials
 */
router.post("/login", async (req, res) => {
  
    const { email, password } = req.body;

    
    const user = await User.findOne({ email });
    if (!user) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

   
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      return res.status(400).json({ message: "Invalid credentials" });
    }

    const token = jwt.sign(
      { id: user._id, role: user.role },
      process.env.JWT_SECRET,
      { expiresIn: "1h" }
    );

    res.json({
      message: "Login successful",
      token,
      role: user.role
    });
});


router.get("/admin/users", auth, admin, async (req, res) => {
  try {
    const users = await User.find().select("-password").populate("cart.productId", "name price");
    
    res.json({
      message: "All users retrieved successfully",
      totalUsers: users.length,
      users
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// View Single User (Admin only)
router.get("/admin/users/:userId", auth, admin, async (req, res) => {
  try {
    const user = await User.findById(req.params.userId).select("-password").populate("cart.productId", "name price category");
    
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({
      message: "User retrieved successfully",
      user
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// View User Stats (Admin only)
router.get("/admin/users-stats", auth, admin, async (req, res) => {
  try {
    const totalUsers = await User.countDocuments();
    const adminCount = await User.countDocuments({ role: "admin" });
    const regularUsers = await User.countDocuments({ role: "user" });
    
    const usersWithCart = await User.countDocuments({ "cart.0": { $exists: true } });
    
    res.json({
      message: "User statistics retrieved",
      stats: {
        totalUsers,
        adminCount,
        regularUsers,
        usersWithActiveCart: usersWithCart
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

/**
 * @swagger
 * /api/products/add:
 *   post:
 *     tags:
 *       - Products
 *     summary: Add a new product (admin only)
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *               price:
 *                 type: number
 *               description:
 *                 type: string
 *               category:
 *                 type: string
 *               stock:
 *                 type: integer
 *     responses:
 *       201:
 *         description: Product added
 */
router.post("/add", auth, admin, async (req, res) => {
  
    const { name, price, description, category, stock } = req.body;

    
    if (!name || !price) {
      return res.status(400).json({
        message: "Name and price are required"
      });
    }

    const product = new Product({
      name,
      price,
      description,
      category,
      stock
    });

    await product.save();

    res.status(201).json({
      message: "Product added successfully",
      product: {
        id: product._id,
        name: product.name,
        price: product.price,
        description: product.description,
        category: product.category,
        stock: product.stock,
        createdAt: product.createdAt
      }
    });
});

// ===== ADMIN ROUTES =====


router.post("/assign", auth, admin, async (req, res) => {
  try {
    const { productId, adminId } = req.body;
    
    if (!productId || !adminId) {
      return res.status(400).json({ message: "Product ID and Admin ID are required" });
    }

    const product = await Product.findByIdAndUpdate(
      productId,
      { assignedAdmin: adminId },
      { new: true }
    );

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    res.json({
      message: "Product assigned successfully",
      product
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});


router.put("/update/:id", auth, admin, async (req, res) => {
  try {
    const { name, price, description, category, stock } = req.body;
    
    const product = await Product.findByIdAndUpdate(
      req.params.id,
      { name, price, description, category, stock },
      { new: true }
    );

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    res.json({
      message: "Product updated successfully",
      product
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// View All Reviews (Admin only)
/**
 * @swagger
 * /api/products/admin/reviews:
 *   get:
 *     tags:
 *       - Reviews
 *     summary: Get all product reviews (admin only)
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: List of reviews
 */
router.get("/admin/reviews", auth, admin, async (req, res) => {
  try {
    const products = await Product.find().populate("reviews.userId", "name email");
    
    const allReviews = [];
    products.forEach(product => {
      product.reviews.forEach(review => {
        allReviews.push({
          productId: product._id,
          productName: product.name,
          ...review.toObject()
        });
      });
    });

    res.json({
      message: "All reviews retrieved",
      totalReviews: allReviews.length,
      reviews: allReviews
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Order Payment View (Admin only)
/**
 * @swagger
 * /api/products/orders/payment:
 *   get:
 *     tags:
 *       - Orders
 *     summary: View payment details for orders (admin only)
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Payment details
 */
router.get("/orders/payment", auth, admin, async (req, res) => {
  try {
    const orders = await Order.find().populate("userId", "name email").populate("items.productId", "name price");
    
    const paymentDetails = orders.map(order => ({
      orderId: order._id,
      userId: order.userId,
      totalAmount: order.totalAmount,
      paymentMethod: order.paymentMethod,
      paymentStatus: order.paymentStatus,
      createdAt: order.createdAt
    }));

    res.json({
      message: "Payment details retrieved",
      totalOrders: paymentDetails.length,
      payments: paymentDetails
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Delivery Tracking GET (Admin only)
/**
 * @swagger
 * /api/products/delivery-tracking:
 *   get:
 *     tags:
 *       - Delivery
 *     summary: Get delivery tracking information (admin only)
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: Delivery tracking
 */
router.get("/delivery-tracking", auth, admin, async (req, res) => {
  try {
    const orders = await Order.find().populate("userId", "name email").select("_id userId deliveryAddress deliveryTracking orderStatus");

    res.json({
      message: "Delivery tracking retrieved",
      totalOrders: orders.length,
      orders: orders
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Delivery Tracking POST (Admin only - Update tracking)
/**
 * @swagger
 * /api/products/delivery-tracking:
 *   post:
 *     tags:
 *       - Delivery
 *     summary: Update delivery tracking (admin only)
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               orderId:
 *                 type: string
 *               status:
 *                 type: string
 *               location:
 *                 type: string
 *               estimatedDelivery:
 *                 type: string
 *     responses:
 *       200:
 *         description: Tracking updated
 */
router.post("/delivery-tracking", auth, admin, async (req, res) => {
  try {
    const { orderId, status, location, estimatedDelivery } = req.body;
    
    if (!orderId || !status) {
      return res.status(400).json({ message: "Order ID and status are required" });
    }

    const order = await Order.findByIdAndUpdate(
      orderId,
      {
        "deliveryTracking.status": status,
        "deliveryTracking.location": location,
        "deliveryTracking.estimatedDelivery": estimatedDelivery,
        "deliveryTracking.updatedAt": new Date(),
        "orderStatus": status === "delivered" ? "delivered" : "shipped"
      },
      { new: true }
    );
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    res.json({
      message: "Delivery tracking updated successfully",
      order
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ===== PUBLIC/USER ROUTES =====

// View All Products
/**
 * @swagger
 * /api/products:
 *   get:
 *     tags:
 *       - Products
 *     summary: Get list of products
 *     responses:
 *       200:
 *         description: List of products
 */
router.get("/", async (req, res) => {
  try {
    const products = await Product.find();
    const mapped = products.map(p => ({
      id: p._id,
      name: p.name,
      price: p.price,
      description: p.description,
      category: p.category,
      stock: p.stock,
      averageRating: p.averageRating || 0,
      totalReviews: p.totalReviews || 0,
      createdAt: p.createdAt
    }));

    res.json({
      message: "Products retrieved successfully",
      count: mapped.length,
      products: mapped
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// View Single Product
/**
 * @swagger
 * /api/products/{id}:
 *   get:
 *     tags:
 *       - Products
 *     summary: Get product by id
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Product details
 */
router.get("/:id", async (req, res) => {
  try {
    const product = await Product.findById(req.params.id);
    
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    res.json({
      message: "Product retrieved successfully",
      product: {
        id: product._id,
        name: product.name,
        price: product.price,
        description: product.description,
        category: product.category,
        stock: product.stock,
        reviews: product.reviews || [],
        averageRating: product.averageRating || 0,
        totalReviews: product.totalReviews || 0,
        createdAt: product.createdAt
      }
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Add to Cart (User authenticated)
/**
 * @swagger
 * /api/products/cart/add:
 *   post:
 *     tags:
 *       - Cart
 *     summary: Add product to cart (user)
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               productId:
 *                 type: string
 *               quantity:
 *                 type: integer
 *     responses:
 *       200:
 *         description: Product added to cart
 */
router.post("/cart/add", async (req, res) => {
  try {
    const { productId, quantity, userId: bodyUserId } = req.body;
    const userId = (req.user && req.user.id) || bodyUserId || req.query.userId;

    if (!productId || !quantity) {
      return res.status(400).json({ message: "Product ID and quantity are required" });
    }

    if (!userId) {
      return res.status(400).json({ message: "userId is required (provide token or userId)" });
    }

    const product = await Product.findById(productId);
    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    // Update user cart (implement with User model)
    await User.findByIdAndUpdate(
      userId,
      { $push: { cart: { productId, quantity } } },
      { new: true }
    );

    const populatedUser = await User.findById(userId).populate("cart.productId", "name price category stock");

    res.json({
      message: "Product added to cart successfully",
      user: populatedUser
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Delete from Cart
router.delete("/cart/delete/:productId", async (req, res) => {
  try {
    const { productId } = req.params;
    const userId = (req.user && req.user.id) || req.body.userId || req.query.userId;

    if (!userId) {
      return res.status(400).json({ message: "userId is required (provide token or userId)" });
    }

    await User.findByIdAndUpdate(
      userId,
      { $pull: { cart: { productId } } },
      { new: true }
    );

    const populatedUser = await User.findById(userId).populate("cart.productId", "name price category stock");

    res.json({
      message: "Product removed from cart successfully",
      user: populatedUser
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Get current user's cart (populated)
/**
 * @swagger
 * /api/products/cart:
 *   get:
 *     tags:
 *       - Cart
 *     summary: Get current user's cart
 *     security:
 *       - BearerAuth: []
 *     responses:
 *       200:
 *         description: User cart
 */
router.get("/cart", async (req, res) => {
  try {
    const userId = (req.user && req.user.id) || req.query.userId || req.body.userId;

    if (!userId) {
      return res.status(400).json({ message: "userId is required (provide token or userId)" });
    }

    const user = await User.findById(userId).select("cart").populate("cart.productId", "name price category stock description");

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({
      message: "Cart retrieved successfully",
      cart: user.cart
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Place Order (POST)
/**
 * @swagger
 * /api/products/orders/place:
 *   post:
 *     tags:
 *       - Orders
 *     summary: Place an order (user)
 *     security:
 *       - BearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               items:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     productId:
 *                       type: string
 *                     quantity:
 *                       type: integer
 *               deliveryAddress:
 *                 type: string
 *               paymentMethod:
 *                 type: string
 *     responses:
 *       201:
 *         description: Order created
 */
router.post("/orders/place", auth, async (req, res) => {
  try {
    const { items, deliveryAddress, paymentMethod } = req.body;
    const userId = req.user.id;

    if (!items || items.length === 0) {
      return res.status(400).json({ message: "Items are required" });
    }

    if (!deliveryAddress || !paymentMethod) {
      return res.status(400).json({ message: "Delivery address and payment method are required" });
    }

    // Calculate total amount
    let totalAmount = 0;
    const processedItems = [];

    for (const item of items) {
      const product = await Product.findById(item.productId);
      if (!product) {
        return res.status(404).json({ message: `Product ${item.productId} not found` });
      }

      if (product.stock < item.quantity) {
        return res.status(400).json({ message: `Insufficient stock for ${product.name}` });
      }

      const subtotal = product.price * item.quantity;
      totalAmount += subtotal;

      processedItems.push({
        productId: product._id,
        productName: product.name,
        quantity: item.quantity,
        price: product.price,
        subtotal: subtotal
      });

      // Reduce stock
      await Product.findByIdAndUpdate(
        product._id,
        { $inc: { stock: -item.quantity } }
      );
    }

    // Create order
    const order = new Order({
      userId,
      items: processedItems,
      totalAmount,
      deliveryAddress,
      paymentMethod,
      paymentStatus: "pending",
      orderStatus: "pending"
    });

    await order.save();

    // Clear user cart
    await User.findByIdAndUpdate(userId, { cart: [] });

    res.status(201).json({
      message: "Order placed successfully",
      order: await order.populate("userId", "name email")
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// View Orders (User)
router.get("/user/orders", auth, async (req, res) => {
  try {
    const userId = req.user.id;
    
    const orders = await Order.find({ userId })
      .populate("items.productId", "name price category")
      .sort({ createdAt: -1 });

    res.json({
      message: "Orders retrieved successfully",
      totalOrders: orders.length,
      orders
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Cancel Order / Delete Order
router.delete("/orders/:orderId", auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { orderId } = req.params;

    const order = await Order.findById(orderId);
    
    if (!order) {
      return res.status(404).json({ message: "Order not found" });
    }

    if (order.userId.toString() !== userId && req.user.role !== "admin") {
      return res.status(403).json({ message: "Unauthorized to delete this order" });
    }

    if (order.orderStatus === "delivered") {
      return res.status(400).json({ message: "Cannot cancel a delivered order" });
    }

    // Restore stock for cancelled order
    for (const item of order.items) {
      await Product.findByIdAndUpdate(
        item.productId,
        { $inc: { stock: item.quantity } }
      );
    }

    const deletedOrder = await Order.findByIdAndDelete(orderId);

    res.json({
      message: "Order cancelled/deleted successfully",
      order: deletedOrder
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Update Profile
router.put("/profile/update", auth, async (req, res) => {
  try {
    const userId = req.user.id;
    const { name, email, phone, address } = req.body;

    const user = await User.findByIdAndUpdate(
      userId,
      { name, email, phone, address },
      { new: true }
    );

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    res.json({
      message: "Profile updated successfully",
      user
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Post Review
router.post("/:productId/reviews", auth, async (req, res) => {
  try {
    const { rating, comment } = req.body;
    const userId = req.user.id;
    const { productId } = req.params;

    if (!rating || rating < 1 || rating > 5) {
      return res.status(400).json({ message: "Rating must be between 1 and 5" });
    }

    const user = await User.findById(userId);
    
    const product = await Product.findByIdAndUpdate(
      productId,
      {
        $push: {
          reviews: {
            userId,
            userName: user.name,
            rating,
            comment,
            createdAt: new Date()
          }
        }
      },
      { new: true }
    ).populate("reviews.userId", "name email");

    if (!product) {
      return res.status(404).json({ message: "Product not found" });
    }

    // Calculate average rating
    const totalRating = product.reviews.reduce((sum, review) => sum + review.rating, 0);
    const averageRating = totalRating / product.reviews.length;

    product.averageRating = parseFloat(averageRating.toFixed(2));
    product.totalReviews = product.reviews.length;
    await product.save();

    res.status(201).json({
      message: "Review posted successfully",
      product
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
