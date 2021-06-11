//вспомогательные методы
module.exports = {

    logStart() {
        console.log('Bot has been started')
    },

    getChatId(msg) {
        return msg.chat.id
    },

    getItemUuid(sourse) {  //метод получения id
        return sourse.substr(2, sourse.length)
    }
}