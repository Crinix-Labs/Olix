require("dotenv").config();
const express = require("express");
const session = require("express-session");
const axios = require("axios");
const bodyParser = require("body-parser");
const app = express();

// Configuration
app.use(
  session({
    secret: process.env.SESSION_SECRET,
    resave: false,
    saveUninitialized: true,
  })
);
app.set("view engine", "ejs");
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static("public"));

// Middleware to check Ollama connection
const checkOllama = async (req, res, next) => {
  try {
    await axios.get(`${process.env.OLLAMA_API}/tags`);
    next();
  } catch (error) {
    res.render("error", { message: "Ollama connection failed!" });
  }
};

// Routes
app.get("/", checkOllama, async (req, res) => {
  try {
    const models = (await axios.get(`${process.env.OLLAMA_API}/tags`)).data
      .models;
    const totalSize = models.reduce((sum, model) => sum + model.size, 0);

    res.render("index", {
      models,
      stats: {
        totalModels: models.length,
        totalSize: (totalSize / 1e9).toFixed(2) + " GB",
        activeModels: models.filter((m) => m.details).length,
      },
    });
  } catch (error) {
    res.render("error", { message: "Error loading dashboard" });
  }
});

// Chat Route
app
  .route("/chat/:model")
  .get(checkOllama, (req, res) => {
    req.session.chatHistory = req.session.chatHistory || [];
    res.render("chat", {
      model: req.params.model,
      history: req.session.chatHistory,
    });
  })
  .post(checkOllama, async (req, res) => {
    try {
      const response = await axios.post(`${process.env.OLLAMA_API}/generate`, {
        model: req.params.model,
        prompt: req.body.prompt,
        stream: false,
      });

      req.session.chatHistory = [
        ...(req.session.chatHistory || []),
        { role: "user", content: req.body.prompt },
        { role: "assistant", content: response.data.response },
      ];

      res.render("chat", {
        model: req.params.model,
        history: req.session.chatHistory,
        prompt: "",
      });
    } catch (error) {
      res.render("error", { message: "Chat error" });
    }
  });

app
  .route("/pull")
  .get((req, res) => res.render("pull"))
  .post(async (req, res) => {
    try {
      const response = await axios.post(`${OLLAMA_API}/pull`, {
        name: req.body.modelname,
        stream: false,
      });
      res.redirect("/");
    } catch (error) {
      res.render("error", { message: "Error pulling model" });
    }
  });

app.get("/delete/:model", async (req, res) => {
  try {
    await axios.delete(`${OLLAMA_API}/delete`, {
      data: { name: req.params.model },
    });
    res.redirect("/");
  } catch (error) {
    res.render("error", { message: "Error deleting model" });
  }
});

app
  .route("/generate/:model")
  .get((req, res) => res.render("generate", { model: req.params.model }))
  .post(async (req, res) => {
    try {
      const response = await axios.post(`${OLLAMA_API}/generate`, {
        model: req.params.model,
        prompt: req.body.prompt,
        stream: false,
      });
      res.render("generate", {
        model: req.params.model,
        result: response.data.response,
        prompt: req.body.prompt,
      });
    } catch (error) {
      res.render("error", { message: "Error generating response" });
    }
  });

app.listen(process.env.PORT, () => {
  console.log(`Server running on port ${process.env.PORT}`);
});
