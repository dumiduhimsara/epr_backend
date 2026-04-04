import mongoose from 'mongoose';

const feedbackSchema = new mongoose.Schema({
    user: { type: String, required: true },       
    officialEmail: { type: String },              
    rating: { type: Number, required: true, min: 1, max: 5 }, 
    text: { type: String, required: true },       
    reply: { type: String, default: "" },         
    date: { type: Date, default: Date.now }   
});

export default mongoose.model('Feedback', feedbackSchema);