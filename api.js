import axios from 'axios';

// මුළු project එකටම එකම base URL එක මෙතන තියෙන්නේ
const API = axios.create({
    baseURL: 'http://192.168.8.101:5000/api'
});

export default API;