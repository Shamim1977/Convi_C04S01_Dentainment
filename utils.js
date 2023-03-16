var config = require("./config");
const os = require("os");
const path = require("path");
var fs = require("fs");
const moment = require('moment');
const sgMail = require("@sendgrid/mail");
const screenshot = require("screenshot-desktop");
const slugify = require("slugify");

module.exports =
{
    splitArray,
    nthIndex,
    substringCount,
    isEmail,
    isStrongPass,
    Sleep,
    dttime,
    BigRand,
    fixChromePref,
    getRandomInt,
    GetAResponse,
    byteCountBase64,
    setCookie,
    endsWith,
    RemoveOldFiles,
    SendMailWithSendGrid,
    TakeCareOfDirs,
    TakeASnap
}

async function TakeCareOfDirs(root, tupples) {
  for (let t = 0; t < tupples.length; t++) {
    let hierarchy = tupples[t];
    let tpath = root;
    for (let h = 0; h < hierarchy.length; h++) {
      tpath = path.join(tpath, hierarchy[h]);
      if (!fs.existsSync(tpath)) fs.mkdirSync(tpath, { recursive: true });
    }
  }
}

async function TakeASnap(prefix) {
  let dt_time = moment().format("YYYY-MM-DD-HH-mm-ss");
  let file_name = slugify(prefix + "_" + dt_time) + ".png";
  let snap = path.join(config.snaps_dir , file_name);
  if (fs.existsSync(snap)) fs.unlinkSync(snap); //this is impossible to be honest!
  let output = await screenshot({ filename: snap }).then((site_snap) => {
    return snap;
  });
  return output;
}

function fixChromePref(){
  let pref_path = path.join(config.chrome_data_dir, 'Default', 'Preferences');
  if (fs.existsSync(pref_path)){
    const resultBuffer = fs.readFileSync(pref_path);
    const resultData = JSON.parse(resultBuffer.toString().trim());
    if (resultData.hasOwnProperty('exit_type')){
      resultData.exit_type = 'none';
    }
    if (resultData.hasOwnProperty('exited_cleanly')){
      resultData.exit_type = true;
    }
  }
}

function RemoveOldFiles(in_dir, age, unit){
  let units = ['year', 'month', 'week', 'day', 'hour', 'minute', 'second'];
  let a_day = 1*24*60*60;
  let mult = [365*a_day, 30*a_day, 7*a_day, a_day, 60*60, 60, 1];      
  if (fs.existsSync(in_dir)) {
    fs.readdirSync(in_dir).forEach((file) => {
      let file_path = path.join(in_dir, file);
      fs.stat(file_path, (err, stats) => {
        if (err) {
          throw err
        }
        let seconds = (new Date().getTime() - stats.ctime) / 1000;
        age = mult[units.indexOf(unit)]*age;
        if (seconds > age){
          try{
            fs.unlinkSync(file_path);
          }catch(ex){
            //keep silent
          }
        }
      })
    });
  }
}

function endsWith(str, suffix) {
  return str.indexOf(suffix, str.length - suffix.length) !== -1;
}

function splitArray(array, parts) {
    let result = [];
    for (let i = parts; i > 0; i--) {
        result.push(array.splice(0, Math.ceil(array.length / i)));
    }
    return result;
  }
  
  function nthIndex(str, subStr, i) {
    return str.split(subStr, i).join(subStr).length;
  }
  
  function substringCount(haystack, needle) {
    let regExp = new RegExp(needle, "gi");
    return (haystack.match(regExp) || []).length;
  }
  
  function isEmail(mail) {
    if (/^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*$/.test(mail)) return (true);
    return (false);
  }
  
  function isStrongPass(pass){
    let pattern = new RegExp("^(?=.*[a-z])(?=.*[A-Z])(?=.*[0-9])(?=.*[!@#\$%\^&\*])(?=.{8,})"); 
    if(pattern.test(pass)) return true;
    return false;
  }
  
  function Sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
  
  function dttime(){
    let today = moment();
    let dttime = today.format('MMMM Do YYYY, h:mm:ss a');
    return dttime;
  }
  
  function BigRand(prefix, suffix){
    let numrand = Math.floor(Math.random() * (999999 - 100000 + 1)) + 100000;
    let today = moment();
    let entity = prefix+today.format('MYYYYMMDDhhmmss')+numrand.toString()+suffix;
    return entity;
  }
  
  function getRandomInt(min, max) {
    min = Math.ceil(min);
    max = Math.floor(max);
    return Math.floor(Math.random() * (max - min) + min); //The maximum is exclusive and the minimum is inclusive
  }
  
  function byteCountBase64(s) {
      return encodeURI(s).split(/%..|./).length - 1;
  }

  function setCookie(name, value, minutes, res) {
    res.cookie(name, value, {
      maxAge: minutes,
      httpOnly: true
    });
    return true;
  }
  
  function GetAResponse(code){
    let resList = {
      100:"Attempt to Duplicity",
      101:"Request Failed",
      103:"Transmission Error",
      104:"Insufficient or Invalid Information",
      105:"Record Non-Existent",
      106:"Invalid Request",
      107:"Account Deactivated or Disabled",
      108:"Invalid Email ID",
      109:"Password Left Blank",
      110:"Invalid Latitude",
      111:"Invalid Longitude",
      112:"Operation Restricted",
      113:"Input length is larger than field length",
      114:"Unsupported file format",
      115:"Unsupported file size",
      116:"Unsupported file dimension",
      117:"Quota to upload images is exhuasted",
      118:"No files to upload",
      119:"DB contains child data depending on Master",
      120:"Unnecessary update attempt",
      121:"Display Name already taken",
      122:"Phone is already taken",
      123:"Attempt to downgrade package",
      124:"No records yet",
      125:"No Images found",
      126:"Image type is invalid",
      127:"Access Denied",
      128:"Invalid Country ID",
      129:"Invalid Phone Number",
      130:"Not enough data fund",
      131:"Internal Error",
      132:"Email not yet verified",
      133:"Transfer amount too low",
      134:"Payment method is not chosen",
      135:"Too weak password",
      136:"Email is already taken",
      137:"Invalid Date",
      138:"Nothing to Process",
      139:"Nothing uploaded",
      140:"Upload size exceeded",
      141:"Already Applied",
      142:"Rejected by Client",
      143:"Automation has been stopped",
      144:"No more records to process",
      145:"Invalid User ID",
      146:"Invalid Quantity",
      147:"Invalid Order ID",
      148:"Deletion Restricted",
      149:"Too big image",
      150:"Too few recipients",
      151:"Section is in use",
      152:"Section is already taken",
      153:"Already taken",
      154:"Date can't be older than today",
      155:"Job Title is in use",
      156:"Job Title is already taken",
      157:"Quota has been exhausted",
      158:"User ID is already taken",
      159:"Invalid Email ID",
      160:"Invalid Verification Code",
      161:"Invalid Password",
      162:"Failed Sending Mail",
      163:"Invalid Token",
      164:"Failed Sending Notification",
      165:"No more records",
      166:"Unnecessary request",
      167:"Invalid User ID",
      168:"Invalid product key",
      169:"Product key expired",
      170:"Product key exhausted",
      171:"Invalid Country",
      172:"Invalid Currency",
      173:"No keys assigned",
      174:"Store is blocked",
      175:"Machine is blocked",
      176:"Unrecognized machine",
      177:"Account has been blocked",
      178:"Account unpriviledged",
      179:"Both passwords are the same",
      180:"Email already verified",
      181:"Invalid password",
      182:"Too many requests to process",
      183:"Requires subscription",
      184:"Already subscribed",
      185:"Email ID not verified",
      186:"Subscription/Renewal required",
      187:"No proxies found",
      188:"Description is too long",
      189:"URL is too long",
      190:"Data combination is already in use",
      191:"Invalid URL",
      192:"Invalid User ID!",
      193:"Order is already submitted",
      194:"Invalid Order ID",
      195:"Callback URL not found",
      200:'Record has one or more dependents',
      201:'New values are identical to original',
      202:'Interval server error',
      203:'Password is too long',
      204:'Full Name left blank',
      205:'Invalid Date of Birth',
      206:'Invalid City',
      207:'Failed uploading avatar',
      208:'Failed sending verification code',
      209:'Full Name must 3-30 characters long',
      210:'Password should be 4-20 characters long',
      211:'Free usage limit has been reached',
      212:'No images have been provided',
      213:'Input image is too large',
      214:'Email is already verified',
      215:'You are temporarily banned',
      216:'Unknown Error',
      217:'No such user',
      218:'Unsolicited request',
      219:'Nothing to save',
      220:'Password is not strong enough',
      221:'Settings not found',
      222:'File type is invalid',
      223:'Existing password is wrong',
      224:'Lead already taken',
      225:'Malformed link or invalid data',
      226:'No suitable face bubbles found',
      444:"Operation Successful",
      555:"It's a Go"
    }
  
    let arr = {
      stat:code,
      desc:resList[code]
    };
    
    return arr;
  
  }

  async function SendMailWithSendGrid(sengrid_creds, recipients, subject, email_text, email_html, attachement='') {
    //https://www.twilio.com/blog/sending-email-attachments-with-sendgrid
    //attachment = fs.readFileSync(pathToAttachment).toString("base64");
  
    //prepare email
    sgMail.setApiKey(sengrid_creds.api_key);

    let cc = [];
    if (recipients.length>1) cc = recipients.splice(0, 1);
    let sender = {
      name:sengrid_creds.name,
      email:sengrid_creds.email,
    };
    
    let msg = {
      to: recipients[0],
      from: sender,
      subject: subject,
      content: [
        {
          type: "text/plain",
          value: email_text,
        },
        {
          type: "text/html",
          value: email_html,
        },
      ],
    };

    if (attachement!=''){
      Object.assign(msg, {
        attachments: [
          {
            content: attachement.content,
            filename: attachement.name,
            type: "application/"+attachement.type,
            disposition: "attachment"
          }
        ]
      })
    }
  
    if (cc.length>0) Object.assign(msg, {cc:cc});
  
    await sgMail
      .send(msg)
      .then((response) => {
        if (response != undefined){
          //console.log(response);
          return true;
        }
      })
      .catch((error) => {
        return false
      });
  }