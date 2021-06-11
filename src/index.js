const TelegramBot = require ('node-telegram-bot-api') //подключение скрипта телеграм бот

const config = require('./config')
const helper = require('./helper')
const keyboard = require('./keyboard')
const kb = require('./keyboard-buttons')
const database = require('../database.json')
const mongoose = require ('mongoose')
const geolib = require('geolib')
const _ = require('lodash')

mongoose.Promise = global.Promise

helper.logStart() //проверка запуска скрипта

mongoose.connect(config.DB_URL, { //передача порта для работы БД
    useMongoClient: true
})
    .then(() => console.log('MongoDB connected'))
    .catch((err) => console.log(err))

     require('./models/film.model')
     require('./models/cinema.model')
     require('./models/user.model')


    //-----------ГЛОБАЛЬНЫЕ ПЕРЕМЕННЫЕ-------------
     const Film = mongoose.model('films')
     const Cinema = mongoose.model('cinemas')
     const User = mongoose.model('users')

     //--------Событие в callback при получении фильмов и добавления их в избранное-------------
    const ACTION_TYPE = {
        TOGGLE_FAV_FILM: 'tff' //переключения добавления и удаления из избранного
      //  SHOW_CINEMAS: 'sc', 
      //  SHOW_CINEMAS_MAP: 'scm',
       // SHOW_FILMS: 'sf'
    }

    //----------Добавление данных в БД--------------
    //database.films.forEach(f => new Film(f).save().catch(e => console.log(e)))
    //database.cinemas.forEach(c => new Cinema(c).save().catch(e => console.log(e)))
   //_________________________________________________
const bot = new TelegramBot (config.TOKEN, { //экземпляр класса с передачей токена
    polling: true  //взаимодействие с сервером
})


//------------КОМАНДЫ--------------------------------
bot.on ('message', msg => { //обработчик получения сообщения от пользователя

    const chatId = helper.getChatId(msg)

    switch (msg.text) {
        case kb.home.favourite:
            showFavouriteFilms(chatId, msg.from.id)
            break

        case kb.home.films:
            bot.sendMessage(chatId, `Выберите жанр:`, {
                reply_markup: {keyboard: keyboard.films}
            })
            break

        case kb.film.comedy:
            sendFilmsByQuery(chatId, {type: 'comedy'})
            break

        case kb.film.action:
            sendFilmsByQuery(chatId, {type: 'action'})
            break

        case kb.film.random:
            sendFilmsByQuery(chatId, {})
            break

        case kb.home.cinemas:
            bot.sendMessage(chatId, `Отправить местоположение`, {
                reply_markup: {
                    keyboard: keyboard.cinemas
                }
            })
            break
         case kb.back:
             bot.sendMessage (chatId, 'Что хотите посмотреть? ', {
                reply_markup: {keyboard: keyboard.home}
             })
            break
    }

    if (msg.location) {  //определение расстояния от пользователя до кинотеатра
        getCinemasInCoord(chatId, msg.location)
    }
})

bot.onText(/\/start/, msg => {
    const text = `Привет, ${msg.from.first_name}!\nЯ CinemaCat, готов помочь тебе с выбором кино или ближайшего кинотеатра, если хочется посмотреть что-то новое:)\nВыбери команду для начала работы: `
    bot.sendPhoto(msg.chat.id, './cat.jpg')
    bot.sendMessage(helper.getChatId(msg), text, {
        reply_markup: {
            keyboard: keyboard.home //открывается начальная конфигурация клавиатуры

        }
    })
})

bot.onText(/\пока/, msg => {
    const text = `До встречи, ${msg.from.first_name}! `
    bot.sendSticker(msg.chat.id, './by.webp')
    bot.sendMessage(helper.getChatId(msg), text, {
        reply_markup: {
            keyboard: keyboard.home

        }
    })
})

bot.onText(/\/f(.+)/, (msg, [sourse, match]) => { //прослушка получения id фильма

    const filmUuid = helper.getItemUuid(sourse)
    const chatId = helper.getChatId(msg)

    Promise.all ([ //объединение
        Film.findOne({uuid: filmUuid}), //поиск id фильма
        User.findOne({telegramId: msg.from.id}) //поиск id пользователя
    ]).then(([film, user])=> {

        let isFav = false //"флаг"

        if(user) {
            isFav = user.films.indexOf(film.uuid) !== -1 //поиск фильма в избранном
        }

        const favText = isFav ? 'Удалить из избранного' : 'Добавить в избранное'

        const caption = `Название: ${film.name}\nГод: ${film.year}\nРейтинг: ${film.rate}\nДлительность: ${film.length}\nСтрана: ${film.country}`
       
        bot.sendPhoto(chatId, film.picture, {
            caption: caption,
            reply_markup: {
                inline_keyboard: [
                    [
                     {
                        text: favText, //Избранное
                        callback_data: JSON.stringify ({
                            type: ACTION_TYPE.TOGGLE_FAV_FILM,
                            filmUuid: film.uuid,
                            isFav: isFav
                        })
                    },
                ],
                [
                    { text: `Кинопоиск ${film.name}`,
                         url: film.link

                }]
                ]
            }
        })
    })
      
    })


bot.onText(/\/c(.+)/, (msg, [sourse, match]) => { //обработчик получения кинотеатра с ссылкой на него
    const cinemaUuid = helper.getItemUuid(sourse)
    const chatId = helper.getChatId(msg)

    Cinema.findOne({uuid: cinemaUuid}).then(cinema => { //получение кинотеатра по id

        bot.sendMessage(chatId, `Кинотеатр ${cinema.name}`, {
            reply_markup: {
                inline_keyboard: [
                    [
                        {text: cinema.name,
                            url: cinema.url

                        }
                    ],
                  
                ]
            }
        })
    })
})

bot.on('callback_query', query => { //обработчик callback запроса для избранного
    const userId = query.from.id
    let data
    try {
        data = JSON.parse(query.data)
        
    } catch (e) {
        throw new Error('Data is not an object')
        
    }
    const { type } = data

    // if (type === ACTION_TYPE.SHOW_CINEMAS_MAP) {
    //     const {lat, lon} = data
    //     bot.sendLocation(query.message.chat.id, lat, lon)

    // } else if (type === ACTION_TYPE.SHOW_CINEMAS) {
    //     sendCinemasByQuery(userId, {uuid: {'$in': data.cinemaUuids}})

     if (type === ACTION_TYPE.TOGGLE_FAV_FILM) {
        toggleFavoriteFilm(userId, query.id, data) //функция работы с избранным

     } //else if (type === ACTION_TYPE.SHOW_FILMS) {
    //     sendFilmsByQuery(userId, {uuid: {'$in': data.filmUuids}})
    // }

})

bot.on('inline_query', query => { //обработка inline режима (всплывающего списка)
    Film.find({}).then(films => {
        const resaults = films.map(f => {
            const caption = `Название: ${f.name}\nГод: ${f.year}\nРейтинг: ${f.rate}\nДлительность: ${f.length}\nСтрана: ${f.country}`
            return {
                id: f.uuid,
                type: 'photo',
                photo_url: f.picture,
                thumb_url: f.picture,
                caption: caption,
                reply_markup: {
                    inline_keyboard: [
                        [{
                            text: `Кинопоиск: ${f.name}`,
                            url: f.link
                        }]
                    ]
                }
            }
        })

        bot.answerInlineQuery(query.id, resaults, { //отправка ответа inline режима
            cache_time: 0
        })
    })
})

//---------------ФУНКЦИИ----------------------------


function sendFilmsByQuery(chatId, query) { //отправка фильмов по запросу БД
    Film.find(query).then(films => {
        const html = films.map((f, i) => { //отправка массива фильмов
            return `<b>${i+1}</b> ${f.name} - /f${f.uuid}` //индекс + название + команда клика по фильму по идентификатору
        }).join('\n') //соединение каждого элемента в одну строку (каждая в новом абзаце)

        sendHTML(chatId, html, 'films')
    })
}

function sendHTML(chatId, html, kbName = null) { //функция для отправки html
    const options = {
        parse_mode: 'HTML' //ключ
    }
    if (kbName) {
        options['reply_markup'] = {
            keyboard: keyboard[kbName]
        }
    }
    bot.sendMessage(chatId, html, options)

}


function getCinemasInCoord(chatId, location) { //функция для вычисления дистанции до кинотеатров
    Cinema.find({}).then(cinemas => { //получение всех кинотеатров из списка

        cinemas.forEach(c=> {
            c.distance = geolib.getDistance(location, c.location) /1000
        })

        cinemas = _.sortBy(cinemas, 'distance') //сортировка расстояний в порядке возрастания

        const html = cinemas.map((c,i) => {
            return `<b>${i+1}</b> ${c.name}. <em>Расстояние</em> - <strong>${c.distance}</strong> км. /c${c.uuid}`
        }).join('\n')

        sendHTML(chatId, html, 'home')


    })
}

function toggleFavoriteFilm(userId, queryId, {filmUuid, isFav}) { //функция для работы с избранными фильмами
    
    let userPromise //переменная для определения пользователя
    
    User.findOne({telegramId: userId})
    .then(user => {
        if(user) {
            if(isFav) {
                user.films = user.films.filter(fUuid => fUuid !== filmUuid ) //удаление фильма из избранного

        }else { 
            user.films.push(filmUuid) } //добавление фильма в избранное
            userPromise = user

        } else {
           userPromise = new User({ //создание пользователя для добавления в избранное
                telegramId: userId,
                films: [filmUuid]
            })
        }
    
        const answerText = isFav ? 'Удалено' : 'Добавлено'

        userPromise.save().then(_=> { //сохранения пользователя
            bot.answerCallbackQuery ( //передача сообщения пользователю
                 queryId, {
                text: answerText
            }).catch (err => console.log(err))
        }).catch (err => console.log(err))
})
}

function showFavouriteFilms(chatId, telegramId) { //функция для передачи избранного полученному пользователю
    User.findOne({telegramId})
    .then(user => { //проверка наличия пользователя
       
        if (user) {  //пользователь добавил в избранное
            Film.find({uuid: {'$in' : user.films}}).then(films => { //получение фильмов массивом значений
                
                let html

                if(films.length) {
                    html = films.map((f, i) => {
                        return `<b>${i+1}</b> ${f.name} - <b>${f.rate}</b> (/f${f.uuid})`
                    }).join('\n')

                } else { //пользователь ничего не добавил
                    html  = 'Вы пока ничего не добавили'
                }
                sendHTML (chatId, html, 'home')
            } ) .catch (e => console.log(e))
        }else {
            sendHTML(chatId, 'Вы пока ничего не добавили', 'home')
        }

    }).catch(e => console.log(e))
}

// function sendCinemasByQuery(userId, query) {
//     Cinema.find(query).then(cinemas => {

//         const html = cinemas.map((c,i) => {
//         return `<b>${i+1}</b> ${c.name} - /c${c.uuid}`
// }).join('\n')
//         sendHTML(userId, html, 'home')
//     })
// }