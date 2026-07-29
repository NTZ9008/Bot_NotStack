// เก็บ reference ของ discord.js Client ตัวเดียวกับที่บอทหลักใช้อยู่ (index.js)
// เพื่อให้ prbot ส่ง/แก้ไขข้อความผ่านบอทตัวเดิม แทนที่จะ login ซ้ำหรือยิง REST เอง
let client = null;

function setClient(c) {
    client = c;
}

function getClient() {
    return client;
}

module.exports = { setClient, getClient };
