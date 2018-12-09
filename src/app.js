//ライブラリを読み込み
const axios = require('axios');
const fs = require('fs-extra')
const path = require('path');
const twitter = require('twitter');
const cron = require('node-cron');
require('date-utils');

process.on('unhandledRejection', console.dir);

//設定を読み込み
const dataDir = path.join(__dirname, '../data/');
const config = require(path.join(dataDir, 'config.json'));

const client = new twitter({
    consumer_key: config.consumer_key,
    consumer_secret: config.consumer_secret,
    access_token_key: config.access_token_key,
    access_token_secret: config.access_token_secret,
});

cron.schedule('0 * * * *', start);


async function start() {

    console.log("start");
    [hisPositions, nowPositions, prevPositions] = setPositions();
    [prevTimeFormat, nowTimeFormat, hisTimeFormat,nowH] =  setTime(prevPositions, hisPositions);

    await getPos(nowPositions);
    [margin, margin24] = getMargin();

    //小数点以下切り捨て
    const nowLong = Math.floor(nowPositions.long.value * 100) / 100;
    const nowShort = Math.floor(nowPositions.short.value * 100) / 100;

    const prevLong = Math.floor(prevPositions.long.value * 100) / 100;
    const prevShort = Math.floor(prevPositions.short.value * 100) / 100;

    const hisLong = Math.floor(hisPositions[nowH].long.value * 100) / 100;
    const hisShort = Math.floor(hisPositions[nowH].short.value * 100) / 100;

    const marginLong = sign(Math.floor(margin.long * 100) / 100)
    const marginShort = sign(Math.floor(margin.short * 100) / 100)

    const margin24Long = sign(Math.floor(margin24.long * 100) / 100)
    const margin24Short = sign(Math.floor(margin24.short * 100) / 100)

    //比率(%)を求める
    const nowParLong = Math.floor(nowLong / (nowLong + nowShort) * 100) + `% `;
    const nowParShort = Math.floor(nowShort / (nowLong + nowShort) * 100) + `%`;

    const prevParLong = Math.floor(prevLong / (prevLong + prevShort) * 100) + `%`;
    const prevParShort = Math.floor(prevShort / (prevLong + prevShort) * 100) + `%`;

    const hisParLong = Math.floor(hisLong / (hisLong + hisShort) * 100) + `%`;
    const hisParShort = Math.floor(hisShort / (hisLong + hisShort) * 100) + `%`;

    let message = `1H\n`;
    message += `${nowTimeFormat} (${prevTimeFormat})\n`;
    message += `\n`;
    message += `LONG : ${nowLong} BTC (${marginLong} BTC)\n`;
    message += `SHORT : ${nowShort} BTC (${marginShort} BTC)\n`;
    message += `\n`;
    message += `LS比 : ${nowParLong} vs ${nowParShort} (${prevParLong} vs ${prevParShort})`;

    let message24 = `24H\n`
    message24 += `${nowTimeFormat} (${hisTimeFormat})\n`;
    message += `\n`;
    message24 += `LONG : ${nowLong} BTC (${margin24Long} BTC)\n`;
    message24 += `SHORT : ${nowShort} BTC (${margin24Short} BTC)\n`;
    message += `\n`;
    message24 += `LS比 : ${nowParLong} vs ${nowParShort} (${hisParLong} vs ${hisParShort})`;

    await uploadImage(message);
    await uploadImage(message24);
    saveData(nowPositions, hisPositions);
    console.log("stop");
}

function setPositions() {


    let prevPositions = fs.readJSONSync(path.join(dataDir, 'previous.json'));

    let nowPositions = { "long": { "time": 0, "value": 0 }, "short": { "time": 0, "value": 0 } };

    let hisPositions = fs.readJSONSync(path.join(dataDir, 'history.json'));

    return [hisPositions, nowPositions, prevPositions];
}

function setTime(prevPositions, hisPositions) {
    let prevTime = new Date(prevPositions.long.time);
    let prevTimeFormat = prevTime.toFormat("YYYY/MM/DD HH24:MI");

    let nowTime = new Date();
    let nowTimeFormat = nowTime.toFormat("YYYY/MM/DD HH24:MI");

    let nowH = Number(nowTime.toFormat("HH24"));

    let hisTime = new Date(hisPositions[nowH].long.time);
    let hisTimeFormat = hisTime.toFormat("YYYY/MM/DD HH24:MI");
    return [prevTimeFormat, nowTimeFormat, hisTimeFormat,nowH];

}

async function getPos(nowPositions) {

    const res = await Promise.all([getLong(nowPositions.long), getShort(nowPositions.short)]);
    nowPositions.long = res[0];
    nowPositions.short = res[1];
}

async function getLong(long) {

    const result = await axios.get('https://api.bitfinex.com/v2/stats1/pos.size:1m:tBTCUSD:long/last');
    long.time = result.data[0];
    long.value = result.data[1];
    return long;
}

async function getShort(short) {
    const result = await axios.get('https://api.bitfinex.com/v2/stats1/pos.size:1m:tBTCUSD:short/last');
    short.time = result.data[0];
    short.value = result.data[1];
    return short;
}



function getMargin() {
    let margin ={};
    let margin24={};
    margin.long = nowPositions.long.value - prevPositions.long.value;
    margin.short = nowPositions.short.value - prevPositions.short.value;
    margin24.long = nowPositions.long.value - hisPositions[nowH].long.value;
    margin24.short = nowPositions.short.value - hisPositions[nowH].short.value;
    return [margin, margin24];
}


async function uploadImage(message) {
    const status = {
        status: message
    }
    await client.post('statuses/update', status);
}

function saveData(nowPositions, hisPositions) {
    fs.writeJSONSync(path.join(dataDir, 'previous.json'), nowPositions);

    hisPositions[nowH].long.time = nowPositions.long.time;
    hisPositions[nowH].long.value = nowPositions.long.value;

    hisPositions[nowH].short.time = nowPositions.short.time;
    hisPositions[nowH].short.value = nowPositions.short.value;

    fs.writeJSONSync(path.join(dataDir, 'history.json'), hisPositions);
}

function timeout(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
};

function sign(val) {
    switch (Math.sign(val)) {
        case 1:
            return `+${val}`
        default:
            return val;
    }
}
