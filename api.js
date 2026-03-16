import axios from 'axios';

// මුළු project එකටම එකම base URL එක මෙතන තියෙන්නේ
const API = axios.create({
    baseURL: 'https://eprbackend-production.up.railway.app/api'
});

export default API;