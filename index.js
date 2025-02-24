const express = require('express');
const mongoose = require('mongoose');
const bodyParser = require('body-parser');
const dotenv = require('dotenv');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');

dotenv.config();

const app = express();
app.use(bodyParser.json());

if (!process.env.JWT_SECRET) {
    console.error('ВНИМАНИЕ: JWT_SECRET не установлен в переменных окружения');
    process.env.JWT_SECRET = 'default-secret-key-123';
}

mongoose.connect('mongodb+srv://asd:asdasd@cluster0.8zrx3.mongodb.net/?retryWrites=true&w=majority&appName=Cluster0')
    .then(() => console.log('MongoDB connected'))
    .catch(err => console.error('MongoDB connection error:', err));

    const taskSchema = new mongoose.Schema({
        title: String,
        description: String,
        completed: Boolean,
        userId: mongoose.Schema.Types.ObjectId,
        createdAt: { 
            type: Date, 
            default: () => new Date().toISOString().split('T')[0] // Сохраняем только дату (гггг-мм-дд)
        },
        comments: [
            {
                text: String,
                author: String,
                createdAt: { type: Date, default: Date.now }
            }
        ]
    });
    
    // TTL индекс для удаления задач через 7 дней
    taskSchema.index({ createdAt: 1 }, { expireAfterSeconds: 604800 });
    
    const Task = mongoose.model('Task', taskSchema);

const userSchema = new mongoose.Schema({
    email: String,
    password: String
});
const User = mongoose.model('User', userSchema);

const authenticate = async (req, res, next) => {
    const token = req.header('Authorization');
    if (!token) return res.status(401).json({ message: 'Access denied' });
    try {
        const verified = jwt.verify(token, process.env.JWT_SECRET);
        req.user = verified;
        next();
    } catch (err) {
        res.status(400).json({ message: 'Invalid token' });
    }
    console.log(token)
};

app.post('/register', async (req, res) => {
    try {
        const { email, password } = req.body;
        
        const existingUser = await User.findOne({ email });
        if (existingUser) {
            return res.status(400).json({ message: 'Пользователь с таким email уже существует' });
        }

        if (!email || !password) {
            return res.status(400).json({ message: 'Email и пароль обязательны' });
        }

        if (password.length < 6) {
            return res.status(400).json({ message: 'Пароль должен содержать минимум 6 символов' });
        }

        const hashedPassword = await bcrypt.hash(password, 10);
        const user = new User({ email, password: hashedPassword });
        await user.save();
        res.json({ message: 'Пользователь успешно зарегистрирован' });
    } catch (error) {
        res.status(500).json({ message: 'Ошибка при регистрации пользователя', error: error.message });
    }
});

app.post('/login', async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email });
        if (!user) {
            return res.status(404).json({ 
                message: 'Пользователь не найден. Пожалуйста, зарегистрируйтесь.',
                needsRegistration: true 
            });
        }
        const validPassword = await bcrypt.compare(password, user.password);
        if (!validPassword) {
            return res.status(400).json({ message: 'Неверный пароль' });
        }
        const token = jwt.sign({ _id: user._id }, process.env.JWT_SECRET);
        res.json({ token });
    } catch (error) {
        res.status(500).json({ message: 'Ошибка при входе в систему', error: error.message });
    }
});

app.post('/tasks', authenticate, async (req, res) => {
    try {
        const { title, description } = req.body;
        const task = new Task({
            title,
            description,
            completed: false,
            userId: req.user._id
        });
        await task.save();
        res.json(task);
    } catch (error) {
        res.status(500).json({ message: 'Error creating task', error: error.message });
    }
});

app.get('/tasks', authenticate, async (req, res) => {
    try {
        const tasks = await Task.find({ userId: req.user._id });
        res.json(tasks);
    } catch (error) {
        res.status(500).json({ message: 'Error fetching tasks', error: error.message });
    }
});

app.put('/tasks/:id', authenticate, async (req, res) => {
    try {
        const task = await Task.findByIdAndUpdate(
            req.params.id,
            req.body,
            { new: true }
        );
        res.json(task);
    } catch (error) {
        res.status(500).json({ message: 'Error updating task', error: error.message });
    }
});

app.delete('/tasks/:id', authenticate, async (req, res) => {
    try {
        await Task.findByIdAndDelete(req.params.id);
        res.json({ message: 'Task deleted successfully' });
    } catch (error) {
        res.status(500).json({ message: 'Error deleting task', error: error.message });
    }
});

app.use(express.static('public'));

app.get('/', (req, res) => {
    res.sendFile('index.html', { root: __dirname });
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));

