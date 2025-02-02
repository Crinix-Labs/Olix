require('dotenv').config();
const express = require('express');
const session = require('express-session');
const axios = require('axios');
const bodyParser = require('body-parser');
const app = express();

// Configuration
app.use(session({
  secret: process.env.SESSION_SECRET,
  resave: false,
  saveUninitialized: true,
  cookie: { secure: process.env.NODE_ENV === 'production' }
}));
app.set('view engine', 'ejs');
app.use(bodyParser.urlencoded({ extended: true }));
app.use(express.static('public'));

// Ollama Connection Middleware
const checkOllamaConnection = async (req, res, next) => {
  try {
    await axios.get(`${process.env.OLLAMA_API}/tags`);
    req.ollamaStatus = true;
  } catch (error) {
    req.ollamaStatus = false;
  }
  next();
};

// Apply middleware to all routes
app.use(checkOllamaConnection);

// Routes
app.get('/', async (req, res) => {
  try {
    const models = req.ollamaStatus ? (await axios.get(`${process.env.OLLAMA_API}/tags`)).data.models : [];
    const totalSize = models.reduce((sum, model) => sum + model.size, 0);
    
    res.render('index', {
      appName: process.env.APP_NAME,
      ollamaStatus: req.ollamaStatus,
      models,
      stats: {
        totalModels: models.length,
        totalSize: (totalSize / 1e9).toFixed(2) + ' GB',
        activeModels: models.filter(m => m.details).length
      }
    });
  } catch (error) {
    res.render('error', { message: 'Error loading dashboard' });
  }
});

// Chat Route
app.route('/chat/:model')
  .get((req, res) => {
    if (!req.ollamaStatus) {
      return res.render('error', { message: 'Ollama connection required for chat' });
    }
    
    req.session.chatHistory = req.session.chatHistory || [];
    res.render('chat', {
      model: req.params.model,
      history: req.session.chatHistory
    });
  })
  .post(async (req, res) => {
    if (!req.ollamaStatus) {
      return res.render('error', { message: 'Ollama connection required for chat' });
    }

    try {
      const response = await axios.post(`${process.env.OLLAMA_API}/generate`, {
        model: req.params.model,
        prompt: req.body.prompt,
        stream: false
      });

      req.session.chatHistory = [
        ...(req.session.chatHistory || []),
        { role: 'user', content: req.body.prompt },
        { role: 'assistant', content: response.data.response }
      ];

      res.render('chat', {
        model: req.params.model,
        history: req.session.chatHistory,
        prompt: ''
      });
    } catch (error) {
      res.render('error', { message: 'Chat error' });
    }
  });

app.route('/pull')
  .get((req, res) => res.render('pull'))
  .post(async (req, res) => {
    try {
      await axios.post(`${process.env.OLLAMA_API}/pull`, {
        name: req.body.modelname,
        stream: false,
      });
      res.redirect('/');
    } catch (error) {
      res.render('error', { message: 'Error pulling model' });
    }
  });

app.get('/delete/:model', async (req, res) => {
  try {
    await axios.delete(`${process.env.OLLAMA_API}/delete`, {
      data: { name: req.params.model },
    });
    res.redirect('/');
  } catch (error) {
    res.render('error', { message: 'Error deleting model' });
  }
});

app.route('/generate/:model')
  .get((req, res) => res.render('generate', { model: req.params.model }))
  .post(async (req, res) => {
    try {
      const response = await axios.post(`${process.env.OLLAMA_API}/generate`, {
        model: req.params.model,
        prompt: req.body.prompt,
        stream: false,
      });
      res.render('generate', {
        model: req.params.model,
        result: response.data.response,
        prompt: req.body.prompt,
      });
    } catch (error) {
      res.render('error', { message: 'Error generating response' });
    }
  });

app.listen(process.env.PORT, () => {
  console.log(`Server running on port ${process.env.PORT}`);
});