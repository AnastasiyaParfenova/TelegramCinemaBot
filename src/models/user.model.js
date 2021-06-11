const mongoose = require('mongoose')
const Schema = mongoose.Schema

//схема пользователя при добавлении фильмов в "избранное"
const UserSchema = new Schema ({
    telegramId: {
        type: Number,
        required: true
    },
    films: {
        type: [String],
        default: []
    }
})

mongoose.model('users', UserSchema)