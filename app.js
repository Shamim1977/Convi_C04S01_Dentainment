const os = require("os");
var config = require("./config");
const Configstore = require("configstore");
const packageJson = require("./package.json");
const utils = require("./utils.js");
const util = require("util");
var http = require("http");
var https = require("https");
var fs = require("fs");
const { parse } = require("csv-parse");
const exec = require("child_process").exec;
const path = require("path");
const express = require("express");
const bodyParser = require("body-parser");
const request = require("request"); //don't uninstall!
var cron = require("node-cron");
const urlExists = require("url-exists");
const axios = require("axios");
  //const escape = require("sql-escape");
const readline = require("readline");
const cors = require("cors");
const md5 = require("md5");
const moment = require("moment");
const slugify = require("slugify");
const validator = require("validator");
const morgan = require("morgan");
const ps = require("ps-node"); //don't uninstall!
const store = new Configstore(packageJson.name, { foo: "appstore" });
const cookieParser = require("cookie-parser");
const si = require("systeminformation");
//const puppeteer = require("puppeteer-core");
const linkCheck = require('link-check');
const puppeteer = require("puppeteer-extra");
const pluginStealth = require("puppeteer-extra-plugin-stealth");
puppeteer.use(pluginStealth());
const concat = require('ffmpeg-concat');
const Xvfb = require("xvfb");
const {
  MongoTransferer,
  MongoDBDuplexConnector,
  LocalFileSystemDuplexConnector,
} = require("mongodb-snapshot");
const {MongoClient} = require("mongodb");
const mongo_url = "mongodb://"+config.db_user+":"+config.db_pass+"@"+'0.0.0.0'+":"+config.db_port+"/?&authMechanism=DEFAULT&authSource=admin&retryWrites=true&writeConcern=majority";
let ObjectId = require("mongodb").ObjectID;

var LOOM_SIGNED_IN = false;
var BROWSERS = [[null, [], 0]]; //one item = [browser, pages, working stat]
var LAST_DEAL_SUFING = {_id:'', tries:0};
var XVFBS = [];
var DISPLAY_COUNT = 0;
let V_FORMATS = ["mkv", "mov", "mp4"];
let up_types = ['intro', 'bubbles', 'supps', 'outtro'];


const pub_path = path.join(__dirname, "public");
const app = express();
app.use(cors());
/*const corsOptions = {
  origin: "http://convi.io", //caller
  optionSuccessStatus: 200,
};
app.use(cors(corsOptions));*/
app.use(bodyParser.json({limit: "1024mb"}));
app.use(bodyParser.urlencoded({limit: "1024mb", extended: true, parameterLimit: 1000000}));
app.use(express.text());
app.use(cookieParser());
app.use(morgan("short")); //or tiny
app.use(express.static(pub_path));
    

app.get(["/"], (req, res) => {});

//just to let caller, all good
app.post(["/stat"], (req, res) => {
  let arr = {
    header: utils.GetAResponse(444),
  };
  res.status(200).send(arr);
});

//======================================================responder-to-main-server=========================
async function ProcessACSV(res, csv_path, server_id){
  //let csv_path = '/root/convi_warehouse/leads.csv';
  if (!fs.existsSync(csv_path)) return;
  //let server_id = '63ed77cc87eea93893990436';
  let dt_time = moment().format("YYYY-MM-DD HH:mm:ss");
  let campaign_id = moment().format("YYYYMMDDHHmmss");
  let unknowns = [];
  let col_map = [];
  let pos = 0;
  let leads = [];
  fs
    .createReadStream(csv_path)
    .pipe(parse({ delimiter: ",", from_line: 1 }))
    .on("data", function (row) {
      if (pos==0){
        for (let r=0; r<row.length; r++){
          let slugged = slugify(row[r]);
          unknowns.push(slugged);
          col_map.push([slugged, row[r]]);
        }
        Object.assign(col_map, ['loomlink', 'Loom Link']);
        pos++;
      }else{
        let doc = {
          "server_id": ObjectId(server_id),
          "company": row[0],
          "lang": row[1],
          "link": row[2],
          "surfed": false,
          "snap_taken_on": "",
          "vid_format": -1,
          "vid_name": "",
          "video_created_on": "",
          "loomlink": "",
          "loom_upload_on": "",
          "opt_status": {
            "code": 0,
            "description": "",
          },
          "mail_notification":{
            "sent": false,
            "on": "",
          },
          "last_update_on": dt_time,
          "campaign_id": campaign_id
        };
        for (let r=3; r<unknowns.length; r++){
          if (!doc.hasOwnProperty(unknowns[r])){
            let obj = {[unknowns[r]] : row[r]};
            Object.assign(doc, obj);
          }
        }
        leads.push(doc);
      }
    })
    .on("end", function () {
      //fs.unlinkSync(file_path);
      InsertAllLeadsFromCSV(res, campaign_id, col_map, leads);
    })
    .on("error", function (error) {
      console.log(error.message);
    });
}

app.post(["/mandir"], async (req, res) => {
  let json_obj = JSON.parse(JSON.stringify(req.body));

  //vid_type: 0=intro, 1=bubble, 2=supplementary, 3=outtro, 4=csv, 5=delete (video), 6 = delete leads

  let secret_key = json_obj.secret_key;
  let action = parseInt(json_obj.action); //0=delete, 1=create for new upload, 2=receive raw leads
  let server_id = json_obj.server_id;
  let server_ip = json_obj.server_ip;
  let vid_type = action==6?-1:parseInt(json_obj.vid_type);
  let lang_id = action>=0 && action<=3?json_obj.lang_id:'';
  
  //validate request
  if (secret_key!=config.secret || server_ip!=config.svr_ip){
    return ReplyToCaller(res, 106, json_obj);
  }
  
  let vid_dir = '';
  let vidarr = [0, 1, 2, 3, 5];
  if (vidarr.includes(vid_type)) vid_dir = path.join(config.assets, up_types[vid_type], lang_id); //server_id not necessary here as it contains own data only!
  if (vid_type==4) vid_dir = path.join(config.assets, config.temp_upload); //csv

  if (action==0 && vid_type>=0 && vid_type<=4){
    if (vid_type == 2 && json_obj.coll_name!='') vid_dir = path.join(vid_dir, json_obj.coll_name);
    if (!fs.existsSync(vid_dir)) fs.mkdirSync(vid_dir, { recursive: true });

    let down_link = json_obj.down_link;
    try{
      let proto = down_link.toLowerCase().startsWith('https')?https:http;
      let filename = down_link.split('/').pop();
      let dest = path.join(vid_dir, filename);
      let file = fs.createWriteStream(dest);
      proto.get(down_link, function(response) {
        response.pipe(file);
        file.on('finish', function() {
          file.close();
          if (vid_type==4) {
            (async()=>{
              await ProcessACSV(res, dest, server_id);
              ReplyToCaller(res, 444, json_obj);
            })();
          }else{
            ReplyToCaller(res, 444, json_obj);
          }
        });
      });
    }catch(ex){
      ReplyToCaller(res, 101, json_obj);
    }
  }

  //delete video folder
  if (action==5){
    try{
      if (fs.existsSync(vid_dir)){
        for (const file of fs.readFileSync(vid_dir)) {
          fs.unlinkSync(path.join(vid_dir, file));
        }
        fs.unlinkSync(vid_dir);
      }
      ReplyToCaller(res, 444, json_obj);
    }catch(ex){
      ReplyToCaller(res, 101, json_obj);
    }
  }

  //delete all leads
  if (action==6){

    Act3DelLeads();

    async function Act3DelLeads(){
      let client = new MongoClient(mongo_url);
      try {
        let db = client.db(config.db_name);

        //leads
        let query = {$and: [{server_id: { $eq: ObjectId(server_id) }}]};
        let coll_leads = db.collection("coll_sys_leads");
        let result = await coll_leads.deleteMany(query);
        //console.log("Deleted " + result.deletedCount + " documents");

        Act3DelMaps();

      } finally {
        await client.close();
      }
    }

    async function Act3DelMaps(){
      let client = new MongoClient(mongo_url);
      try {
        let db = client.db(config.db_name);

        //column map
        let query = {};
        let coll_leads = db.collection("coll_sys_col_map");
        let result = await coll_leads.deleteMany(query);
        //console.log("Deleted " + result.deletedCount + " documents");

        Act3Repond();

      } finally {
        await client.close();
      }
    }

    async function Act3Repond(){
      let arr = {
        header: utils.GetAResponse(444),
        body:{
          given_data: json_obj,
        },
      };
      res.status(200).send(arr);
    }

  }

});

function InsertAllLeadsFromCSV(res, campaign, col_map, leads){
  for (let d=0; d<leads.length; d++){
    leads[d].server_id = ObjectId(leads[d].server_id);
  }

  //data to coll_sys_col_map
  MongoClient.connect(mongo_url, function (err, db) {
    if (err) throw err;
    let coll_map_doc = [{
      campaign_id: campaign,
      col_map: col_map
     }];
    let dbo = db.db(config.db_name);
    dbo.collection("coll_sys_col_map").insertMany(coll_map_doc, function (err, resp) {
      if (err) console.log(err);  
      db.close();
    });
  });

  //data to coll_sys_leads
  MongoClient.connect(mongo_url, function (err, db) {
    if (err) throw err;
    let dbo = db.db(config.db_name);
    dbo.collection("coll_sys_leads").insertMany(leads, function (err, resp) {
      if (err) console.log(err);  
      db.close();
      if (res!='') {
        let data = {
          secret_key:config.secret,
          action : 2,
          server_id:leads[0].server_id,
          server_ip:config.svr_ip,
          campaign_id:campaign,
          col_map: col_map,
          leads:leads,
        };
        ReplyToCaller(res, 444, data);
      }else{
        console.log('Insertion complete.');
      }
    });
  });
}

function ReplyToCaller(res, resp_code, body=''){
  let arr = {
    header: utils.GetAResponse(resp_code),
    body:body,
  };
  res.status(200).send(arr);
}
//======================================================responder-to-main-server=========================

//===================================================io_and_start_server=================================
const server = http.createServer(app);


let tupples = [["intro"], ["outtro"], ["bubbles"], ['failures'], ['snapshots'], ['supps'], ['failsafe'], ['temps'], ["vid_out"], ['downloads', 'reports']];
utils.TakeCareOfDirs(config.assets, tupples);
tupples = [['db_backup']];
utils.TakeCareOfDirs(pub_path, tupples);
let del_dirs = [config.snaps_dir, config.vid_out];
for (let i=0; i<del_dirs; d++){
  if (fs.existsSync(del_dirs[i])) {        
    fs.readdirSync(del_dirs[i]).forEach((file) => {
      let one_file = path.join(del_dirs[i], file);
      fs.unlinkSync(one_file);
    });
  }  
}
StartServer();

var server_running = false;
async function StartServer() {
  if (server_running == true) return;

  server.listen(config.port, function () {
    let svr = config.svr_proto + "://" + config.svr_ip + ":" + config.port;
    console.log("Server started at " + svr + "...");
    console.log("App PID: " + process.pid);

    (async () => {
      let data = await si.graphics();
      DISPLAY_COUNT = JSON.parse(JSON.stringify(data)).displays.length;
      console.log("Display count: " + DISPLAY_COUNT);
    })();
    
    server_running = true;
    RunCron();
  });
}

//https://www.npmjs.com/package/node-cron
function RunCron() {
  cron.schedule("*/30 * * * * *", () => {
    let vpaths = [config.temp_upload, config.vid_out, config.snaps_dir, config.failures, config.downloads];
    for (let v=0; v<vpaths.length; v++) utils.RemoveOldFiles(vpaths[v], 6, 'hour');
    (async()=>{DeleteOldDocs(180, 'day');})();
    (async()=>{ResetMessedUpOnes();})();
    if (BROWSERS[0][2]!=0) return; //0=not running, 1=running, 2=paused (not in use)
    GetSettingsDuo('');
  });
}

async function GetSettingsDuo(ex_lead) {

  //just get one lead
  let one_lead = await GetOneLead2Proceed(ex_lead);

  //if no internet, what can happen will happen - that's what Murphy said!!!
  let isConnected = false;
  while (isConnected==false){
    utils.Sleep(1000);
    isConnected = !!await require('dns').promises.resolve('google.com').catch(()=>{});
  }

  //Get settings from mainframe
  let task = 5;
  let data = {
    secret: config.secret, 
    ip:config.svr_ip, 
    action: task
  };
  axios
  .post(config.get_data_link, data)
  .then((response) => {
    
    let RData = JSON.stringify(response.data);
    let prefs = JSON.parse(RData);
    if (parseInt(prefs.header.stat) != 444) return console.log('Mainframe returned error!');
    prefs = prefs.body;
    
    //try to send pending noti mails
    //SendNotiMails(prefs); //regards if server or functions have been stopped, it's the right of the clients to get notified
    
    //retreat if no more leads
    if (one_lead=='' || one_lead==undefined || one_lead==null) {
      BROWSERS[0][2] = 0;
      let dt_time = moment().format("YYYY-MM-DD HH:mm:ss");
      return console.log(dt_time + ' : No more leads at this moment, waiting for the next trigger...');
    }

    //if denied by admins/super admins
    let passed = ToContinue(prefs);
    if (passed==false) return;

    //Manage virtual display, lauch browser or simply go for rendering if everything is already in place...
    if (config.display == false && os.platform() == "linux" && DISPLAY_COUNT < 1 && XVFBS.length < 1) {
      ManageDisplay(0, prefs, one_lead, {});
    } else {
      if (BROWSERS[0][0] == null || BROWSERS[0][1].length < 1) {
        InitiateBrowser(0, prefs, one_lead, {});
      } else {
        console.log('trying with a new lead...')
        UpdateServerTryNext(0, prefs, one_lead, {});
      }
    }
  })
  .catch((error) => {
    console.log("Error: " + error);
  });
}

function ManageDisplay(action, prefs, lead, status) {
  let mainframe_settings = prefs.mainframe_settings;
  let vid_width = mainframe_settings.vid_creation.video_width;
  let vid_height = mainframe_settings.vid_creation.video_height;

  if (config.display == false) {
    if (DISPLAY_COUNT < 1) {
      let xvfb = new Xvfb({
        displayNum: 99,
        silent: true,
        reuse: true,
        xvfb_args: [
          "-screen",
          "0",
          vid_width + "x" + vid_height + "x24",
          "-ac",
        ],
      });
      xvfb.start(function (err, xvfbProcess) {
        if (!err) {
          XVFBS.push(xvfb);
          if (BROWSERS[action][0] == null || BROWSERS[action][1].length < 1) {
            InitiateBrowser(action, prefs, lead, status);
          } else {
            UpdateServerTryNext(action, prefs, lead, status);
          }
        } else {
          console.log("Error initiating virtual display!");
          console.log(err);
        }
      });
    }
  } 
}

async function InitiateBrowser(action, prefs, one_lead, status) {
  if (BROWSERS[action][0] != null) {
    console.log("Getting back to looper...");
    return UpdateServerTryNext(action, prefs, one_lead, status);
  }

  //fix chrome session
  //utils.fixChromePref();

  console.log("Launching browser...");
  let mainframe_settings = prefs.mainframe_settings;
  let vid_width = parseInt(mainframe_settings.vid_creation.video_width);
  let vid_height = parseInt(mainframe_settings.vid_creation.video_height);
  let use_proxy = mainframe_settings.automation.use_proxy;
  let proxy_host = mainframe_settings.automation.proxy_host;

  //https://www.cnblogs.com/baihuitestsoftware/p/10562909.html
  let args = [
    "--ignore-certificate-errors",
    "--disable-setuid-sandbox",
    '--disable-dev-shm-usage',
    "--disable-gpu",
    '--no-first-run',
    "--no-sandbox",
    '--no-zygote',
    "--disable-site-isolation-trials",
    "--disable-notifications",
    "--enable-automation",
    "--disable-infobars",
    "--window-size=" + (vid_width + "," + vid_height),
    "--window-position=0,0",
    "--load-extension=" + config.extension,
    //'--user-agent="'+config.user_agent+'"'
    //'--user-data-dir='+config.chrome_data_dir,
    //'--profile-directory="Profile 1"',
    //'--profile-directory='+ path.join(utils.ChromeUserDir(), 'Default')
  ];

  if (config.display == false && os.platform() == "linux" &&  DISPLAY_COUNT < 1) {
    let disp = XVFBS[0];
    args.push("--display=" + disp._display);
  }

   //if proxy permitted by dev and admin
   if (use_proxy==true && proxy_host!='') {
    args.push("--proxy-server="+proxy_host);  
  }

  let boptions = {
    executablePath: config.chrome_path,
    args: args,
    defaultViewport: {
      width:vid_width,
      height:vid_height
    },
    ignoreHTTPSErrors: true,
    headless: false,
    ignoreDefaultArgs: ["--enable-automation"], //--disable-extensions, --mute-audio
  };

  let browser = await puppeteer.launch(boptions);
  BROWSERS[action][0] = browser;

  console.log("Starting looper...");
  UpdateServerTryNext(action, prefs, one_lead, status);
  
}

async function InitiatePage(action, prefs, dumb, idx) {
  let WORKING_BROWSER = BROWSERS[action][0];
  let WORKING_PAGES = BROWSERS[action][1];

  //if we already have the page
  if (idx >= 0 && WORKING_PAGES.length > idx) return WORKING_PAGES[idx];

  try {
    let settings = prefs.mainframe_settings;
    let vid_width = settings.vid_creation.video_width;
    let vid_height = settings.vid_creation.video_height;
    
    let use_proxy = settings.automation.use_proxy; 
    let proxy_user = settings.automation.proxy_user;
    let proxy_pass = settings.automation.proxy_pass;

    let page = (await WORKING_BROWSER.pages())[0];
    if (idx > 0 && BROWSERS[action][1].length <= idx) page = await WORKING_BROWSER.newPage();

    //let UA = user_agents[Math.floor(Math.random() * user_agents.length)];
    //await page.setUserAgent(UA);
    //const iPhone = puppeteer.devices['iPhone 6'];
    //await page.emulate(iPhone);

    await page.setViewport({
      width: vid_width,
      height: vid_height,
      deviceScaleFactor: 1,
    });
    await page.setJavaScriptEnabled(true);
    page.setDefaultNavigationTimeout(0);

    //if not to render image, not for this app
    if (dumb == true) {
      await page.setRequestInterception(true);
      page.on("request", (request) => {
        if (request.resourceType() === "image" || request.resourceType() === "font" || request.resourceType() === "stylesheet") {
          request.abort();
        } else {
          request.continue();
        }
      });
    }

    //let UA = config.user_agents[Math.floor(Math.random() * config.user_agents.length)];
    //await page.setUserAgent(config.user_agent);
    await page.setUserAgent(config.user_agent);

    //handle dialog
    page.on("dialog", async (dialog) => {
      console.log("dialog messasge: " + dialog.message());
      await dialog.accept();
      //await dialog.dismiss();
    });

    //set proxy pass if permitted by dev and admin
    if (use_proxy==true && proxy_user!='' && proxy_pass!='') {
      await page.authenticate({
        username: proxy_user,
        password: proxy_pass
      });
    }

    //handle errors
    /*page.on('error', async err => {
      await page.reload();
    });*/

    BROWSERS[action][1].push(page);
    //BROWSERS[action][2] = 2;
    return page;
  } catch (e) {
    console.log(e);
    //BROWSERS[0] = [null, [], 0];
    BROWSERS[action][2] = 0;
  }
}

async function UpdateServerTryNext(action, prefs, one_lead, status){
  //0=retry, 444=success
  if (!status.hasOwnProperty('code')){ //if a brand new call, intelligent, huh?
    BROWSERS[action][2] = 0;
    RenderWebpage(action, prefs, one_lead);
  }else{
    if (parseInt(status.code)==0){ //if from RenderWebpage loop itself
      utils.Sleep(3000); //just relax to try again, though the initial wait is pointless!!!
      BROWSERS[action][2] = 0;
      return RenderWebpage(action, prefs, one_lead);  
    }else{
      //prepare to update db if the lead is found
      let dt_time = moment().format("YYYY-MM-DD HH:mm:ss");
      let up_obj = {
        surfed: true,
        opt_status: {
          code: status.code,
          description: status.msg
        },
        last_update_on: dt_time,
      };
      await UpdateLeadPostIVU(one_lead._id, up_obj);
      GetSettingsDuo(one_lead);
    }
  }
}

//decision by mainframe and client
function ToContinue(prefs){
  let passed=true;

  if (prefs.mainframe_settings.automation.keep_on != true) {
    console.log('Automation was forced to be stopped!');
    passed=false;
  }

  //later we will look into my_server_settings for this!
  if (prefs.mainframe_settings.automation_loom.loom_email == '' || prefs.mainframe_settings.automation_loom.loom_pass == '') {
    console.log('Loom credentials are missing, no point surfing/creating video!');
    passed=false;
  }

  let act_stat = parseInt(prefs.my_server_settings.activity_status);
  let termi_by = prefs.my_server_settings.termination.by;
  let termi_on = prefs.my_server_settings.termination.on;
  let keep_auto = prefs.my_server_settings.automation_settings.automation.keep_automating;

  if (act_stat!=1 || termi_by!='' || termi_on!='' || keep_auto==false){
    console.log('Autmation has been terminated!');
    TerminateBrowsers(0);
    passed=false;
  }

  return passed;
}

//get a fresh lead to process
async function GetOneLead2Proceed(one_lead){
  let _id = (one_lead==''?'':one_lead._id);
  let client = new MongoClient(mongo_url);
  try{
    let db = client.db(config.db_name);
    let query = {$and:[
      {_id: _id==''?{$exists: true}:{$gt: ObjectId(_id)}},
      {loomlink:{$eq: ''}},
      {"opt_status.code":{$eq: 0}}
    ]}; 
    let options = {
      sort: {_id: 1},
      limit: 1,
      //projection: { _id: 0, amazonlink: 1, market_entity: 1 },
    };
    let coll_leads = db.collection("coll_sys_leads");
    let leads = await coll_leads.find(query, options).toArray();
    return (leads==null?'':leads[0]);
  }catch(ex){
	  console.log(e);
    return '';
  }finally{
    await client.close();
  }
}

//surf the lead
async function RenderWebpage(action, prefs, one_lead) {

  if (BROWSERS[action][2]!=0) return; //if busy
  BROWSERS[action][2]=1; //flag as busy to avoid unexpected overrides

  /*
   "_id" : ObjectId("639a90ea02cbbea9c0633399"),
    "server_id" : ObjectId("638f720c3c84a5a9149b8af6"),
    "company" : "amazon",
    "lang" : "de",
    "link" : "https://yahoo.de",
    "surfed" : false,
    "snap_taken_on" : "",
    "vid_format" : -1,
    "vid_name" : "",
    "video_created_on" : "",
    "loomlink" : "",
    "loom_upload_on" : "",
    "opt_status" : {
      "code" : 0,
      "description" : ""
    },
    "mail_notification":{
      "sent":false,
      "on":"",
    },
    "last_update_on" : "2022-12-15 03:13:46"
  */
  
  let alink = one_lead.link;
  if (!alink.startsWith('http://') && !alink.startsWith('https://')) alink = 'https://'+alink; //https is better than protocol is unknown
  if (validator.isURL(alink)==false){
    return UpdateServerTryNext(action, prefs, one_lead, {code:333, msg:'Link is invalid!'});
  }
  
  //if too many failures
  let exhausted = await ExhaustedTrying(action, prefs, one_lead);
  if (exhausted==true) return;
  
  //load first tab
  let wb = BROWSERS[action][0];
  let pgs = await wb.pages();
  if (pgs.length<2){
    try {
      let first_tab = prefs.my_server_settings.automation_settings.video.first_tab;
      console.log("Surfing first tab: " + first_tab);
      let init_page = await InitiatePage(action, prefs, false, 0);
      await init_page.goto(first_tab, {waitUntil: 'domcontentloaded'});  
    } catch (err) {
      console.log(err);
      return UpdateServerTryNext(action, prefs, one_lead, {code:0, msg:''});
    }
  }
  //load first tab

  //check if cookie consent
  await SurfASite(one_lead);

  async function SurfASite(lead){
    //load home
    BROWSERS[action][2]=2;

    let WORKING_BROWSER = BROWSERS[action][0];
    let pages = await WORKING_BROWSER.pages();

    let main_page = undefined;
    let page_is_dead=false;
    if (pages.length<2){
      main_page = await InitiatePage(action, prefs, false, 1);
      main_page.on('requestfailed', request => {
        page_is_dead=true;
      });
      //handle dilogs
      main_page.on('dialog', async dialog => {
        console.log(dialog.message());
        await dialog.dismiss();
      })
    }

    console.log('Loading target home: '+ alink);
    pages = await WORKING_BROWSER.pages();
    main_page = pages[1];
    
    let redirects = [];
    let client = await main_page.target().createCDPSession();
    await client.send('Network.enable');
    await client.on('Network.requestWillBeSent', (e) => {
      if (e.type !== "Document") {
          return;
      }
      redirects.push(e.documentURL);
    });

    await main_page.bringToFront(); //in case we don't have focus!
    try{
      await main_page.goto(alink, {waitUntil: 'networkidle0', timeout:30000}); //waitUntil: 'networkidle0', 
      //await main_page.waitForNavigation();
    }catch(err){
      console.log(`Page error 2: ${err.toString()}`);
      return PageDeadAction(action, prefs, lead);
    }

    console.log('Making sure page is loaded properly, forcing to wait for 10 seconds...');
    await utils.Sleep(10000); //not a good practice, but works great!
    //wait for favicon

    //if page found dead
    if (page_is_dead==true) return PageDeadAction(action, prefs, lead);

    //if page title is not found
    let pageTitle = await main_page.title();
    if (pageTitle=='' || pageTitle==undefined || pageTitle==null) {
      return PageDeadAction(action, prefs, lead);
    }
    let unex = ['Not Found', 'Bad Gateway'];
    for (let u=0; u<unex.length; u++){
      if (pageTitle.includes("Not Found") || pageTitle.includes("Bad Gateway")){
        page_is_dead=true;
        break;
      }
    }
    if (page_is_dead==true) return PageDeadAction(action, prefs, lead);
    

    //if cloudflare states that page is dead
    let page_source = await main_page.content();
    unex = ['Cloudflare Ray ID', '502 Bad Gateway', '404 Not Found'];
    for (let u=0; u<unex.length; u++){
      if (page_source.includes(unex[u])) {
        page_is_dead=true;
        break;
      }
    }
    if (page_is_dead==true) return PageDeadAction(action, prefs, lead);


    let patterns = ['accept all', 'accept', 'ok', 'got it', 'i know', 'yes', 'sure', 'i agree'];
    let patt_ex = ['alle akzeptieren', 'akzeptieren', 'verstanden', 'ich weiß', 'jawohl', 'sicher', 'ich stimme zu', 'estou ciente'];
    patterns = patterns.concat(patt_ex);
    
    for (let p=0; p<patterns.length; p++){
      let elems = await main_page.$x("//*[contains(translate(text(), 'ABCDEFGHIJKLMNOPQRSTUVWXYZ', 'abcdefghijklmnopqrstuvwxyz'), '"+patterns[p]+"')]");
      if (elems.length>0) {
        //let box = GetElementBox(main_page, elems[0]);
        //await elems[0].click();

        let rect = await main_page.evaluate(el => {
          let {top, left, width, height} = el.getBoundingClientRect();
          return {top, left, width, height};
        }, elems[0]);
        if (rect.left>0 && rect.top>0){
          let tagName = await main_page.evaluate(element => element.tagName, elems[0]);
          console.log('tagName: '+ tagName);
          if (tagName.toLowerCase()=='a' || tagName.toLowerCase()=='button'){
            try{
              await elems[0].click();
            }catch(ex){
              console.log('Failed to click');
            }
          }else{
            await main_page.mouse.click(rect.left-5, rect.top-5); //assuming it's inside the clickable element
          }
        }
        
        //console.log('Waiting a bit after clicking on a consent element...');
        //await utils.Sleep(3000); //not a good practice, but works great!
        break;
      }
    }

    //snapshot
    //await main_page.pdf({ path: '/root/convi_warehouse/snapshots/site.pdf', format: 'A4' });

    //let today = moment();
    await main_page.bringToFront(); //in case we don't have focus!
    let im_path = await utils.TakeASnap(lead._id);
    console.log("Screenshot saved as: " + im_path);  
    let dt_time = moment().format("YYYY-MM-DD-HH-mm-ss");
    let up_obj = {
      surfed:true,
      last_update_on: dt_time,
    };
    await UpdateLeadPostIVU(lead._id, up_obj);
    CreateAVideo(im_path, lead);

  }

  async function PageDeadAction(action, prefs, lead){
    let failsafe_vid_path = '';
    if (fs.existsSync(config.failsafe)) {
      fs.readdirSync(config.failsafe).forEach((file) => {
        failsafe_vid_path = path.join(config.failsafe, file);
        return false;
      });
    }
    if (failsafe_vid_path==''){
      //return UpdateServerTryNext(action, prefs, lead, {code:216, msg:'Surfing Error, probably because of a dead link!'});
      let WORKING_BROWSER = BROWSERS[action][0];
      let pages = await WORKING_BROWSER.pages();
      let main_page = pages[0];
      await main_page.bringToFront();
      let im_path = await utils.TakeASnap(lead._id);
      console.log("Screenshot saved as: " + im_path);  
      let dt_time = moment().format("YYYY-MM-DD-HH-mm-ss");
      let up_obj = {
        surfed:true,
        last_update_on: dt_time,
      };
      main_page = pages[1];
      await main_page.bringToFront();
      await UpdateLeadPostIVU(lead._id, up_obj);
      CreateAVideo(im_path, lead);
    }else{
      let failsafe_data = {
        out_path: failsafe_vid_path,
        vid_format:failsafe_vid_path.split('.')[1],
        lead:lead
      };
      return DBVid(failsafe_data);
    }
  }

  async function CreateAVideo(snap_path, lead) {
    //update cursor
    let exhausted = await ExhaustedTrying(action, prefs, lead);
    if (exhausted==true) return;

    //once again
    let WORKING_BROWSER = BROWSERS[action][0];
    let pages = await WORKING_BROWSER.pages();
    let main_page = pages[1];
    await main_page.bringToFront();

    try {
      //get bubble or other lang
      let lead_lang = GetLanguageID(prefs, lead.lang);
      
      let master_collection = [];

      let positives = ['true', 'yes', 'y', '1'];
      let supp_dir = path.join(config.vid_supp, lead_lang);
      let supps = 0;
      for (let key in lead){
        if (!key.toLowerCase().startsWith(config.segment_prefix)) continue;
        let val = lead[key].toString().trim();
        let adir = path.join(supp_dir, key);
        if (fs.existsSync(adir) && (!positives.includes(val.toLowerCase() || val==''))) {        
          fs.readdirSync(adir).forEach((file) => {
            let one_sup = path.join(adir, file);
            console.log(one_sup);
            /*let stat = fs.lstatSync(one_sup);
            if (stat.isDirectory()) return;*/
            master_collection.push(one_sup);
            supps++;
          });
        }
      };

      if (supps>0){
        //intro
        let intro_path = '';
        let intro_dir = path.join(config.vid_intro, lead_lang);
        if (fs.existsSync(intro_dir)) {
          fs.readdirSync(intro_dir).forEach((file) => {
            let ipath = path.join(intro_dir, file);
            /*let stat = fs.lstatSync(intro_path);
            if (stat.isDirectory()) return;*/
            intro_path = ipath;
          });
          if (intro_path!='' && fs.existsSync(intro_path)) {
            master_collection.unshift(intro_path);
            console.log('intro_path: '+ intro_path);
          }
        }

        let outtro_dir = path.join(config.vid_outtro, lead_lang);
        let outtro_path = '';
        if (fs.existsSync(outtro_dir)) {
          fs.readdirSync(outtro_dir).forEach((file) => {
            let opath = path.join(outtro_dir, file);
            /*let stat = fs.lstatSync(opath);
            if (stat.isDirectory()) return;*/
            outtro_path = opath;
          });
          if (outtro_path!='' && fs.existsSync(outtro_path)) {
            master_collection.push(outtro_path); //need just one, so not inside loop
            console.log('outtro_path: '+ outtro_path);
          }
        }
      }else{
        //single
        master_collection = []; //redim the collection
        let bubble_dir = path.join(config.vid_bubble, lead_lang);
        let bubble_path = '';
        if (fs.existsSync(bubble_dir)) {
          fs.readdirSync(bubble_dir).forEach((file) => {
            let bpath = path.join(bubble_dir, file);
            /*let stat = fs.lstatSync(bpath);
            if (stat.isDirectory()) return;*/
            bubble_path = bpath;
          });
          if (bubble_path!='' && fs.existsSync(bubble_path)) {
            master_collection.push(bubble_path); //need just one, so not inside loop
            console.log('bubble_path: '+ bubble_path);
          }
        }
      }
      
      if (master_collection.length==0){
        console.log("No videos found, moving on...");
        return UpdateServerTryNext(action, prefs, lead, {code:226, msg:'No video segments found'});
      }

      console.log(supps>0?'Using segments...':'Using one-taker...');
      for (let x=0; x<master_collection.length; x++){
        console.log(master_collection[x]);
      }

      //vid setting object
      let vid_sett = prefs.mainframe_settings.vid_creation;
      let w = parseInt(vid_sett.video_width);
      let h = parseInt(vid_sett.video_height);

      //output format
      let cvf_num = parseInt(vid_sett.video_format);
      let out_format = V_FORMATS[cvf_num - 1];

      //dimension of video
      let dims2 = w + ":" + h;

      //audio channels
      let channels = parseInt(vid_sett.audio_channel);
      
      let today_ = Date.now(); //moment().format("HHmmss");
      let nice_fname = slugify(lead.company)
        .trim()
        .replace(/\.$/, "")
        .trim();

      let fname = (nice_fname==''?today_:nice_fname) + "." + out_format;
      let out_path = path.join(config.vid_out, fname);
      let conc_out = out_path.replace(("." + out_format), ("_temp." + out_format));
      
      if (fs.existsSync(out_path)) fs.unlinkSync(out_path);

      console.log("Generating temp video...");

      //merging
      let vcnt = master_collection.length;
      let ff_cmd = "ffmpeg";
      let avcom = '';
      for (let i=0; i<vcnt; i++){
        ff_cmd += ' -i "' + master_collection[i] + '"';
        avcom += '['+i+':v] ['+i+':a]';
      }
      avcom += ' concat=n='+vcnt+':v=1:a=1 [v][a]';
      ff_cmd += ' -filter_complex "'+avcom + '" -map [v] -map [a] -c:v qtrle -c:a aac -preset ultrafast -y "' + conc_out + '"';
      exec(ff_cmd, (error, stdout, stderr) => {
        if (error) {
          console.error(`exec error: ${error}`);
          return CreateAVideo(snap_path, lead);
        }
        console.log("Concatenated video has been generated-");
        console.log(conc_out);
        GenerateFinalVid();
      });

      //overlaying
      function GenerateFinalVid(){
        ff_cmd = 'ffmpeg -i "'+snap_path+'" -i "'+conc_out+'" -filter_complex "[0]scale='+dims2+'[img]; [1]scale='+dims2+'[vid]; [img][vid] overlay=0:0" -c:v libx264 -c:a aac -preset ultrafast -y "'+out_path+'"';
        exec(ff_cmd, (error, stdout, stderr) => {
          if (error) {
            console.error(`exec error: ${error}`);
            return CreateAVideo(snap_path, lead);
          }
          if (fs.existsSync(snap_path)) fs.unlinkSync(snap_path);
          let vid_list = [out_path];
          let data = {
            vid_list: vid_list,
            vid_format: cvf_num,
            lead: lead,
            dims: dims2,
            channels: channels,
            out_path: out_path,
          }
          if (fs.existsSync(conc_out)) fs.unlinkSync(conc_out);
          console.log("Final video has been generated-");
          console.log(out_path);
          DBVid(data);
        });
      }

    } catch (e) {
      console.log(e + ", retrying...");
      CreateAVideo(snap_path, lead);
    }
  }

  async function DBVid(data){
    let dt_time = moment().format("YYYY-MM-DD HH:mm:ss");
    let filename = path.basename(data.out_path);
    let up_obj = { 
      surfed: true, //again, but its ok
      vid_format: data.vid_format,
      vid_name: filename,
      video_created_on: dt_time,
      last_update_on: dt_time,
    };
    await UpdateLeadPostIVU(data.lead._id, up_obj);
    await UploadVidToLoom(data.out_path, data.lead);
  }

  async function UploadVidToLoom(vid_path, lead) {
    let selector = '';
    let xpath = '';

    //update cursor
    let exhausted = await ExhaustedTrying(action, prefs, lead);
    if (exhausted==true) return;

    let loom_page;

    //check page count, and remove it loom is already open
    let WORKING_BROWSER = BROWSERS[action][0];
    let pages = await WORKING_BROWSER.pages();
    if (pages.length<3){
      loom_page = await InitiatePage(action, prefs, false, 2);
      await loom_page.goto(config.loom_login); //, {waitUntil: 'domcontentloaded'}
    }else{
      loom_page = pages[2];
      await loom_page.reload();
    }
    await loom_page.bringToFront();

    if (LOOM_SIGNED_IN == false) {
      //define file name & check if file exists
      if (!fs.existsSync(vid_path)) {
        console.log("Video (" + vid_path + ") does not exist, retrying...");
        return UploadVidToLoom(vid_path, lead);
      }
      //define file name & check if file exists

      await loom_page.goto(config.loom_login); //, {waitUntil: "networkidle2"}

      //Check if sign in
      let homes = [];
      let eminputs = [];
      xpath = '//span[contains(text(), "Home")]';
      GRE = (await GetReadyElement(action, 2, xpath, "", 0, false)) || [false, []];
      if (GRE[0] == true && GRE[1].length > 0) {
        homes = GRE[1]; //await loom_page.$x(xpath) || [];
      } else {
        xpath = '//input[@id="email"]';
        eminputs = (await loom_page.$x(xpath)) || [];
      }
      if (homes.length < 1 && eminputs.length < 1) {
        console.log("Loom home/login could not be loaded properly, retrying...");
        return UploadVidToLoom(vid_path, lead);
      }

      //if on login page
      if (eminputs.length > 0) {
        try {
          await eminputs[0].click({ clickCount: 3 });
          await eminputs[0].press("Backspace");
          await eminputs[0].type(prefs.mainframe_settings.automation_loom.loom_email);
          //await eminputs[0].press("Tab");
          console.log("Passed loom email!");
        } catch (err) {
          console.log("Could not locate loom email input, retrying...");
          return UploadVidToLoom(vid_path, lead);
        }

        //password
        try {
          xpath = '//input[@id="password"]';
          await loom_page.waitForXPath(xpath, {
            visible: true,
            timeout: config.min_wait * 1000,
          });
          let inpass = (await loom_page.$x(xpath)) || [];
          if (inpass.length < 1) {
            console.log("Loom password input did not appear, retrying...");
            return UploadVidToLoom(vid_path, lead);
          }
          await inpass[0].click({ clickCount: 3 });
          await inpass[0].press("Backspace");
          await inpass[0].type(prefs.mainframe_settings.automation_loom.loom_pass);
          await inpass[0].press("Enter");
          //await loom_page.waitForNavigation();
          console.log("Passed loom pass!");
        } catch (err) {
          console.log("Could not locate loom password input, retrying...");
          return UploadVidToLoom(vid_path, lead);
        }
      } else {
        await loom_page.goto(config.loom_uplink); //, {waitUntil: "networkidle2"}
        //await loom_page.waitForNavigation();
      }

      //check if home loaded
      if (homes.length < 1 && eminputs.length > 0) {
        try {
          console.log("Checking if loom home is loaded...");
          selector = "button.profile-bubble_avatarLink_1kN";
          await loom_page.waitForSelector(selector, {
            timeout: config.min_wait * 1000,
          });
          homes = loom_page.$$(selector) || [];
          if (homes.length < 1) {
            console.log("Could not determine if loom home is loaded, retrying...");
            return UploadVidToLoom(vid_path, lead);
          }
          LOOM_SIGNED_IN = true;
        } catch (err) {
          console.log("Error locating loom avatar, retrying...");
          return UploadVidToLoom(vid_path, lead);
        }
      }
    }

    //Get and click button "Upload a video" on page, to load modal
    try {
      let btn = null;
      xpath = '//span[contains(text(), "Upload a video")]';
      GRE = (await GetReadyElement(action, 2, xpath, "", 0, false)) || [
        false,
        [],
      ];
      if (GRE[0] == true && GRE[1].length > 0) {
        btn = GRE[1][0];
        for (let b = 0; b < 2; b++) btn = await btn.getProperty("parentNode");
      } else {
        xpath = '//span[contains(text(), "New video")]';
        await loom_page.waitForXPath(xpath, {
          timeout: config.min_wait * 1000,
        });
        let nvspans = (await loom_page.$x(xpath)) || [];
        if (nvspans.length < 1) return UploadVidToLoom(vid_path, lead);
        btn = await nvspans[0].getProperty("parentNode");
        await btn.click();
        xpath = '//li[@id="downshift-0-item-1"]';
        await loom_page.waitForXPath(xpath, {
          timeout: config.min_wait * 1000,
        });
        let uva_links = (await loom_page.$x(xpath)) || [];
        if (uva_links.length < 1) {
          console.log("Could not locate sub-menu 'Upload a video', retrying...");
          return UploadVidToLoom(vid_path, lead);
        }
        btn = uva_links[0];
      }
      await btn.click();
      console.log("Clicked on upload a video!");
    } catch (err) {
      console.log("Error detecting upload a video button, retrying...");
      console.log(err);
      return UploadVidToLoom(vid_path, lead);
    }

    //test if modal is loaded
    xpath = '//button[contains(text(), "browse files")]';
    await loom_page.waitForXPath(xpath, { timeout: config.min_wait * 1000 });
    let bfiles = (await loom_page.$x(xpath)) || [];
    if (bfiles.length < 1) {
      console.log("Error browse files button, retrying...");
      return UploadVidToLoom(vid_path, lead);
    }

    //find the inputs
    try {
      let inpfiles = (await loom_page.$$("input[type=file]")) || [];
      if (inpfiles.length < 2) return UploadVidToLoom(vid_path, lead);
      await inpfiles[0].uploadFile(vid_path);
      await inpfiles[1].uploadFile(vid_path);
      console.log("Done setting file to input!");
    } catch (err) {
      console.log("Error setting file to input, retrying...");
      return UploadVidToLoom(vid_path, lead);
    }

    //Click Upload 1 file (or Upload 3/4/5 files...)
    try {
      xpath = '//button[contains(text(), "Upload 1 file")]';
      await loom_page.waitForXPath(xpath, {visible:true, timeout: config.min_wait * 1000});
      let uofiles = (await loom_page.$x(xpath)) || [];
      if (uofiles.length < 1) {
        console.log("Button 'Upload 1 file' could not be located on modal!");
        return UploadVidToLoom(vid_path, lead);
      }
      await uofiles[0].click();

    } catch (err) {
      console.log('Failed uploading file, retrying...');
      return UploadVidToLoom(vid_path, lead);
    }
    
    //wait for completion
    try{
      let divcomps = [];
      let waited  = 0;
      xpath = '//div[contains(text(), "Complete")]';
      while (divcomps.length<1  && waited<300){
        divcomps = (await loom_page.$x(xpath)) || [];
        await utils.Sleep(1000);
        waited++;
      }
      if (divcomps.length < 1) { 
        console.log('Upload seems to be failed, retrying...');
        return UploadVidToLoom(vid_path, lead);
      }
      console.log('Upload went successful, waiting for link...');
    }catch(e){
      console.log('Could not determine upload confidence!');
    }
    
    //get uploaded link
    try {
      selector = "a.uppy-Dashboard-Item-previewLink";
      let vlink = (await loom_page.$eval(selector, (anchor) =>  anchor.getAttribute('href'))) || '';
      if (vlink!=''){

        console.log('loomlink: '+ vlink);
        //close modal
        selector = 'button.uppy-u-reset.uppy-Dashboard-close';
        let cls_btns = await loom_page.$$(selector);
        if (cls_btns.length>0) await cls_btns[0].click();

        //update json
        let dt_time = moment().format("YYYY-MM-DD-HH-mm-ss");
        let up_obj =  {
          surfed:true,
          loomlink: vlink,
          loom_upload_on: dt_time,
          opt_status: {
            code: 444,
            description: 'Operation went successful'
          },
          last_update_on: dt_time,
        };
        await UpdateLeadPostIVU(lead._id, up_obj);
          
        //reload page so that vid_path gets released and then delete it
        await loom_page.reload();
        if (fs.existsSync(vid_path) && !vid_path.includes('/failsafe/') ) fs.unlinkSync(vid_path);

        //close 3+ tabs if any
        WORKING_BROWSER = BROWSERS[action][0];
        pages = await WORKING_BROWSER.pages();
        while (pages.length > 3) {
          await pages[pages.length-1].close();
          pages = await WORKING_BROWSER.pages();
        }

      }
      
    } catch (err) {
      console.log(err);
      return UploadVidToLoom(vid_path, lead);
    }

    //go for next
    BROWSERS[0][2] = 0;
    GetSettingsDuo(lead);
  }

}












//generic
app.post(["/misleads"], (req, res) => {
  let obj = JSON.parse(JSON.stringify(req.body)); 
  let secret = obj.secret;
  let server_id = obj.server_id;
  let last_id = obj.last_id == ''?'':obj.last_id;
  let status = parseInt(obj.status); //0=not surfed yet, 1=queue, 2=successful, 3=failed, 4=all

  if (secret!=config.secret){
    let arr = {
      header: utils.GetAResponse(101),
      body:{
        given_data:{
          server_id: server_id,
          last_id: last_id, 
          status: status,
        },
        leads:[]
      },
    };
    res.status(200).send(arr);
    return;
  }
  
  GetMisLeads(req, res, server_id, last_id, status);
});

async function GetMisLeads(req, res, server_id, last_id, status){
  let client = new MongoClient(mongo_url);

  try{
    let db = client.db(config.db_name);
    
    let conds = [
      {server_id: ObjectId(server_id)},
      {_id: last_id=='' || status==4?{$exists: true}:{$gt: ObjectId(last_id)}},
    ];

    //0=not surfed yet, 1=in queue, 2=successful, 3=failed, 4=all

    if (status==0) {
      conds.push({surfed:false});
      conds.push({loomlink: {$eq: ''}});
      conds.push({"opt_status.code":{$eq: 0}});
    }
    if (status==1) {
      conds.push({surfed: {$eq: true}}); //queue
      conds.push({loomlink: {$eq: ''}});
      conds.push({"opt_status.code":{$eq: 0}});
    }
    if (status==2) {
      conds.push({surfed: {$eq: true}}); //successful
      conds.push({loomlink: {$ne: ''}});
      conds.push({"opt_status.code":{$eq: 444}});
    }
    if (status==3) { //failed
      conds.push({"opt_status.code":{$ne: 0}});
      conds.push({"opt_status.code":{$ne: 444}});
    }
    if (status==4) { //all
      //do nothing
    }

    let query = {$and:conds}; 
    let options = {sort: {_id: 1}};
    if (status!=4) Object.assign(options, {limit:100});

    let coll_leads = db.collection("coll_sys_leads");
    let total = await coll_leads.count();
    let leads = await coll_leads.find(query, options).toArray();

    let arr = {
      header: utils.GetAResponse(leads.length<1?165:444),
      body:{
        given_data:{
          server_id: server_id,
          last_id:last_id, 
          status:status,
        },
        total:total,
        leads:leads
      },
    };
    ReturnSearchedRows(res, arr);

  }finally{
	  await client.close();
  }

}

async function ReturnSearchedRows(res, arr){
  let client = new MongoClient(mongo_url);
  try{
    let db = client.db(config.db_name);

    let conds = [{_id: {$exists: true}}];
    let query = {$and: conds}; 
    let options = {sort: {_id: 1}};
    Object.assign(options, {limit:1});

    let coll_maps = db.collection("coll_sys_col_map");
    let  maps = await coll_maps.find(query, options).toArray();
    arr.body.col_map = maps==null?[]:maps[0];

    res.status(200).send(arr);

  }finally{
    await client.close();
  }

}

//delleads
app.post(["/delleads"], (req, res) => {
  
  let obj = JSON.parse(JSON.stringify(req.body)); 
  let secret_key = obj.secret_key;
  let server_id = obj.server_id;
  let server_ip = obj.server_ip;
  let leads = obj.leads; //only id of a lead

  let given_data = {
    secret_key: secret_key,
    server_id: server_id, 
    server_ip: server_ip,
    leads:leads,
  };

  if (secret_key!=config.secret || server_ip!=config.svr_ip){
    let arr = {
      header: utils.GetAResponse(101),
      body:{
        given_data:given_data,
      },
    };
    res.status(200).send(arr);
    return;
  }

  //delete leads now
  DeleteSelLeads(res, leads, given_data)

});

async function DeleteSelLeads(res, leads, given_data) {
  let objects = [];
  for (let d=0; d<leads.length; d++){
    objects.push(ObjectId(leads[d]));
  }

  let client = new MongoClient(mongo_url);
  try {
    let db = client.db(config.db_name);
    let query = {_id: {$in: objects}};
    let coll_leads = db.collection("coll_sys_leads");
    let result = await coll_leads.deleteMany(query);
    //console.log("Deleted " + result.deletedCount + " documents");
    let arr = {
      header: utils.GetAResponse(444),
      body:{
        given_data:given_data,
      },
    };
    res.status(200).send(arr);
  } finally {
    await client.close();
  }

}

//add update a raw lead
app.post(["/aerawlead"], (req, res) => {
  
  let obj = JSON.parse(JSON.stringify(req.body)); 
  let secret_key = obj.secret_key;
  let server_id = obj.server_id;
  let server_ip = obj.server_ip;
  let lead = obj.lead; //only id of a lead

  let given_data = {
    secret_key: secret_key,
    server_id: server_id, 
    server_ip: server_ip,
    lead:lead,
  };

  if (secret_key!=config.secret || server_ip!=config.svr_ip){
    let arr = {
      header: utils.GetAResponse(101),
      body:{
        given_data:given_data,
      },
    };
    res.status(200).send(arr);
    return;
  }

  //delete leads now
  AddUpdateRawLead(res, given_data);

});

async function AddUpdateRawLead(res, given_data){

  let dt_time = moment().format("YYYY-MM-DD HH:mm:ss");
  let client = new MongoClient(mongo_url);

  try{
    let database = client.db(config.db_name);
    let leads_coll = database.collection("coll_sys_leads");

    //find
    let filter = {_id: {$eq: ObjectId(given_data.lead._id)}};
    let options = {sort: {_id: 1},};
    let leads = await leads_coll.find(filter, options).toArray();
    let up_lead = '';
    if (leads.length>0){
      leads[0].company = given_data.lead.company;
      leads[0].lang = given_data.lead.lang;
      leads[0].link = given_data.lead.link;
      up_lead = {
        $set:leads[0]
      };
    }else{
      up_lead = {
        $set: {
          "server_id": ObjectId(given_data.server_id),
          "company": given_data.lead.company,
          "lang": given_data.lead.lang,
          "link": given_data.lead.link,
          "surfed": false,
          "snap_taken_on": "",
          "vid_format": -1,
          "vid_name": "",
          "video_created_on": "",
          "loomlink": "",
          "loom_upload_on": "",
          "opt_status": {
            "code": 0,
            "description": ""
          },
          "last_update_on": dt_time
        }
      }
    }

    //upsert now
    options = { upsert: true };
    let result = await leads_coll.updateOne(filter, up_lead, options);
    
    //return response
    if (given_data.lead._id == '') given_data.lead._id = result.insertedId;
    let arr = {
      header: utils.GetAResponse(444),
      body:{
        given_data:given_data,
      },
    };
    res.status(200).send(arr);

  }finally{
    await client.close();
  }

}

var now_mailing=false;
async function SendNotiMails(prefs){

  if (now_mailing==true) return;
  now_mailing = true;

  //send mail from midnihght to half past midnight; later we will use clients timezone
  //moment('2010-10-20').isBetween('2010-10-19', '2010-10-25');

  let now = new Date().getHours();
  if (now >= 18 && now <= 19) {
    //ok
  } else {
    now_mailing=false;
    return;
  }

  let main_settings = prefs.mainframe_settings;
  let my_settings = prefs.my_server_settings;

  let app_name = main_settings.app.app_name;
  //let mail_format = main_settings.mailing.format; //1==html 2=text
  let sender = main_settings.mailing.sender;
  let position = main_settings.mailing.position; //ok to be empty
  let sg_email = main_settings.mailing.sendgrid_email;
  let sg_key = main_settings.mailing.sendgrid_api_key;
  let sg_creds = {
    api_key:sg_key,
    name:sender,
    email:sg_email
  };

  let client_attn = my_settings.clients[0].attn;
  let client_email = my_settings.clients[0].attn_email;

  let svr_name = my_settings.server_name;
  let svr_ip = my_settings.server_ip;
  let rec_name = my_settings.automation_settings.mailing.recipient_name; //ok to be empty
  let rec_mail = my_settings.automation_settings.mailing.recipient_email;
  let error_report = my_settings.automation_settings.mailing.send_err_reports;
  let daily_report = my_settings.automation_settings.mailing.send_daily_reports;
  let recipients = [
    {
      email: rec_mail,
      name: rec_name,
    }
  ];
  
  if (sender=='' || sg_key=='') return now_mailing=false; 
  if (utils.isEmail(sg_email)==false) return now_mailing=false; 
  if (utils.isEmail(rec_mail)==false) return now_mailing=false; 

  //try to send 2 reports
  let score = {
    required:0,
    scored:0,
  };
  if (error_report==true) {
    score.required++;
    SendReport2Client(0);
  }
  if (daily_report==true) {
    score.required++;
    SendReport2Client(1);
  }

  async function SendReport2Client(type){
    let client = new MongoClient(mongo_url);
    try{
      let db = client.db(config.db_name);
      let query = {$and: [{_id: { $exists: true}}, {'mail_notification.sent':{$eq:false}}, {'opt_status.code': {$nin: [0, 444]}}]};
      if (type==1) query = {$and: [{_id: { $exists: true}}, {'mail_notification.sent':{$eq:false}}, {'opt_status.code': {$eq: 444}}]};

      let options = {$sort: {_id: 1}};
      let coll_leads = db.collection("coll_sys_leads");
      let rep_leads = await coll_leads.find(query, options).toArray();
      if (rep_leads!=null) {
        if (rep_leads.length>0){
          Prepare2SendMail(rep_leads);
        }else{
          now_mailing=false; 
        }
      }else{
        now_mailing=false; 
      }
    }finally{
      await client.close();
    }

    function Prepare2SendMail(rep_leads){
      try{
        let dt_time = moment().format("YYYY-MM-DD");
        let file_name = app_name+"_"+(type==0?'error':'daily')+"_report_"+dt_time+".csv";
        let save_as = path.join(config.downloads, file_name);
        //let downlink = config.app_url + '/downloads/reports/'+file_name;
        if (fs.existsSync(save_as)) fs.unlinkSync(save_as);
        let rows = [
          ["#",
          "company",
          "language",
          "link",
          "loom_link",
          "last_update_on"]
        ];
        if (type==0) rows[0].splice(5, 0, 'error');
        for (let d=0;d<rep_leads.length; d++){
          let one_row = 
          [
            d+1,
            rep_leads[d].company,
            rep_leads[d].lang,
            rep_leads[d].link,
            rep_leads[d].loomlink,
            rep_leads[d].last_update_on,
          ];
          if (type==0) one_row.splice(5, 0, rep_leads[d].opt_status.description);
          rows.push(one_row);
        }

        let csv = "";
        for (let i of rows) {
          csv += i.join(",") + "\r\n";
        }
        fs.writeFileSync(save_as, csv);
        let sub_suffix = (type==0?'Error':'Daily') + ' Report';

        //main content
        let email_text = 'Hi ' + (rec_name==''?client_attn:rec_name) + ',\r\n';
        email_text += 'Good afternoon.\r\n\r\n';
        email_text += 'We just prepared the scheduled '+sub_suffix+' for you server <strong>'+svr_name + ' (' + svr_ip +')</strong> which is enclosed herewith.\r\n';
        if (type==0) email_text += 'This report consists of <strong>' + rep_leads.length + '</strong> lead'+(rep_leads.length>1?'s':'')+' that failed. Every lead should have the reason behind the failure. Please feel free to let us know if you think convi is making any mistakes.\r\n\r\n';
        if (type==1) email_text += 'This report consists of <strong>' + rep_leads.length + '</strong> lead'+(rep_leads.length>1?'s':'')+' that we processed successfully and placed the loom link next to the lead link.\r\n\r\n';
        email_text += '<strong>'+svr_name + ' (' + svr_ip + ')</strong>\r\n\r\n'
        email_text += 'Regards.\r\n';
        email_text += sender+'\r\n';
        if (position!='') email_text += position+'\r\n';
        email_text += app_name+'\r\n';
        email_text += config.service_root;

        let main_cont = email_text.replace(/\r\n/g, '<br>');

        //send mail
        let subject = app_name + ' - ' + sub_suffix;
        let variabless = ['v_app_logo', 'v_mail_title', 'v_app_name',  'v_content_body', 'v_app_link'];
        let vals = [config.app_logo, sub_suffix, app_name, main_cont, config.service_root];
        let email_html = fs.readFileSync(config.email_templates.noti, {encoding:'utf8', flag:'r'});
        for (let v=0; v<variabless.length; v++){
          let regex = new RegExp('{{{'+variabless[v]+'}}}', "g");
          email_html = email_html.replace(regex, vals[v]);
        }

        let attachment_cont = fs.readFileSync(save_as).toString("base64");
        let attachment = {
          content: attachment_cont,
          name:file_name,
          type:'csv',
        };

        utils.SendMailWithSendGrid(sg_creds, recipients, subject, email_text, email_html, attachment);
        score.scored++;

        //update db at the end
        if (score.scored>=score.required) UpdateDBReportSent(rep_leads);

      }catch(ex){
        console.log(ex);
      }

      now_mailing=false; 
    }

    async function UpdateDBReportSent(rep_leads){
      let dt_time = moment().format("YYYY-MM-DD HH:mm:ss");
      let id_list = [];
      for (let d=0; d<rep_leads.length;d++){
        id_list.push(rep_leads[d]._id);
      }
      let client = new MongoClient(mongo_url);
      try{
        let db = client.db(config.db_name);
        let set_data = {
          mail_notification:{
            sent: true,
            on: dt_time,
          },
        };
        let filter = {_id: {$in: id_list}};
        let updata = {$set: set_data};
        options = {upsert: true}; 
        let coll_leads= db.collection("coll_sys_leads"); 
        let result = await coll_leads.updateMany(filter, updata, options);
      }finally{
        await client.close();
      }

      now_mailing=false; 
    }

  }

}

//======================================================gsheet-grabber===================================

async function UpdateLeadPostIVU(_id, up_obj) {
  let client = new MongoClient(mongo_url);
  try{
    let db = client.db(config.db_name);
    let filter = {_id: ObjectId(_id)};
    let update = {$set: up_obj};
    let options = {upsert: false };
    let coll_leads = db.collection("coll_sys_leads");
    let result = await coll_leads.findOneAndUpdate(filter, update, options);
    //console.log ('update count: '+ result.lastErrorObject.n);
    //console.log ('success: '+ result.lastErrorObject.updatedExisting);
  }finally{
    await client.close();
  }
}

async function ResetMessedUpOnes() {
  let client = new MongoClient(mongo_url);
  try{
    let db = client.db(config.db_name);
    let filter = {$and: [{surfed: true, "opt_status.code":{$eq:0}}]};
    let update = {$set: {surfed:false, snap_taken_on:"", vid_format:-1, vid_name:"", video_created_on:""}};
    let options = {upsert: false };
    let coll_leads = db.collection("coll_sys_leads");
    let result = await coll_leads.updateMany(filter, update, options);
    //console.log ('update count: '+ result.lastErrorObject.n);
    //console.log ('success: '+ result.lastErrorObject.updatedExisting);
  }finally{
    await client.close();
  }
}

async function DeleteOldDocs(age, unit) {
  let client = new MongoClient(mongo_url);
  try{
    let startdate = moment().subtract(age, unit+'s').format('YYYY-MM-DD HH:mm:ss');
    let db = client.db(config.db_name);
    let filter = {last_update_on: {$lte:startdate}};
    let coll_leads = db.collection("coll_sys_leads");
    let result = await coll_leads.deleteMany(filter);
    //console.log ('update count: '+ result.deletedCount);
  }finally{
    await client.close();
  }
}

//======================================================gsheet-grabber===================================



//======================================================utilities========================================

async function ExhaustedTrying(action, prefs, lead){
  //if too many failures
  if (LAST_DEAL_SUFING._id==lead._id && parseInt(LAST_DEAL_SUFING.tries)>=4){
    LAST_DEAL_SUFING = {_id:'', tries:0};
    utils.TakeASnap("failures");
    console.log('Too many failures, moving on...');
    await UpdateServerTryNext(action, prefs, lead, {code:225, msg:'Too many failures!'});
    return true;
  }

  //update cursor
  if (LAST_DEAL_SUFING._id==lead._id) {
    LAST_DEAL_SUFING.tries = parseInt(LAST_DEAL_SUFING.tries)+1;
  }else{
    LAST_DEAL_SUFING = {_id:lead._id, tries:0};
  }

  return false;
}

function GetLanguageID(prefs, lang_iso2){
  lang_iso2 = lang_iso2==''?'en':lang_iso2;
  let langs = prefs.languages_all;
  let lang_id = '638bdd6578b2ee72e4e7f4ac'; //english
  for (let g=0; g<langs.length;g++){
    if (langs[g].lang_short==lang_iso2){
      lang_id=langs[g]._id;
      break;
    }
  }
  return lang_id;
}

async function GetReadyElement(action, pidx, xpath, selector, index, guaranteed) {
  if (pidx < 0 || pidx + 1 > BROWSERS[action][1].length) return [false, []];
  if ((xpath + selector).trim() == "") return [false, []];

  let ready = false;
  let elements = [];
  let max_wait = guaranteed == true ? config.max_wait : config.min_wait;
  let waited = 0;
  let page = BROWSERS[action][1][pidx];

  while (waited < max_wait && elements.length < index + 1) {
    await utils.Sleep(1000);
    waited++;
    page = BROWSERS[action][1][pidx];
    elements =
      (xpath != "" ? await page.$x(xpath) : await page.$$(selector)) || [];
  }

  page = BROWSERS[action][1][pidx];
  if (elements.length > index) ready = await isElemReady(page, elements[index]);

  return [ready, elements];
}

async function isElemReady(page, element) {
  let box = await GetElementBox(page, element);
  if (box=='') return false;
  return true;
}

async function GetElementBox(page, element) {
  let isVisibleHandle = await page.evaluateHandle((e) => {
    let style = window.getComputedStyle(e);
    return (
      style &&
      style.display !== "none" &&
      style.visibility !== "hidden" &&
      style.opacity !== "0"
    );
  }, element);
  let visible = await isVisibleHandle.jsonValue();
  //let visible2 = await page.evaluate((e) => e.offsetWidth > 0 && e.offsetHeight > 0, element)
  let box = await element.boxModel();
  if (visible && box) return box;

  return '';
}

async function ScrollIntoView(page, element){
  await page.evaluate((e) => {
    e.scrollIntoView({
      behavior: "smooth",
      block: "end",
      inline: "end",
    });
  }, element);
}

async function TerminateBrowsers(action) {
  //0=amazon/upwork, else, 1=loom
  let browser = BROWSERS[action][0];
  if (browser==null) return;
  try {
    LAST_DEAL_SUFING = {_id:'', tries:0};
    if (browser != null && BROWSERS[action][1].length > 0) {
      BROWSERS[action] = [null, [], 0];
      let pages = await browser.pages();
      for (const page of pages) {
        await page.close();
      }
      await browser.close();
    }
  } catch (e) {
    console.log("Error closing browser!");
  } finally {
    await browser.close();
  }
}

async function checkFavicon(page) {
  const iconUrl = await page.$eval("link[rel*='icon']", ({ href }) => href);
  await page.goto(iconUrl);
  await page.goBack();
}

async function PageIndexOfSite(bindex, pattern){
  let pidx = -1;
  if (BROWSERS.length<=0 || BROWSERS.length<bindex+1) return pidx;
  let WORKING_BROWSER = BROWSERS[bindex][0];
  let pages = await WORKING_BROWSER.pages();
  if (pages.length<1) return pidx;
  for (let p=0; p>pages.length; p++){
    //let ttl = await pages[p].title();
    let url = await pages[p].url();
    if (url.contains(pattern)) {
      pidx = p;
      break;
    }
  }
  return pidx;
}


//ProcessCSV('63c854be6a95802d944b506d', '/root/convi_warehouse/temps/Leads_9670.csv');
function ProcessCSV(server_id, file_path){
  let processed_leads = [];
  let unknowns = [];
  let pos = 0;
  let dt_time = moment().format("YYYY-MM-DD HH:mm:ss");

  fs
  .createReadStream(file_path)
  .pipe(parse({ delimiter: ",", from_line: 1 }))
  .on("data", function (row) {
    if (pos==0){
      for (let r=0; r<row.length; r++){
        unknowns.push(slugify(row[r]));
      }
      pos++;
    }else{
      let doc = {
        "server_id": ObjectId(server_id),
        "company": row[0],
        "lang": row[1],
        "link": row[2],
        "surfed": false,
        "snap_taken_on": "",
        "vid_format": -1,
        "vid_name": "",
        "video_created_on": "",
        "loomlink": "",
        "loom_upload_on": "",
        "opt_status": {
          "code": 0,
          "description": "",
        },
        "mail_notification":{
          "sent": false,
          "on": "",
        },
        "last_update_on": dt_time,
      };
      for (let r=3; r<unknowns.length; r++){
        if (!doc.hasOwnProperty(unknowns[r])){
          let obj = {[unknowns[r]] : row[r]};
          Object.assign(doc, obj);
        }
      }
      processed_leads.push(doc);
    }
  })
  .on("end", function () {
    //send data to client
    fs.unlinkSync(file_path);
    InsertAllLeadsFromCSV("", "", processed_leads);
    processed_leads = [];
    unknowns = [];
    pos = 0;
  })
  .on("error", function (error) {
    console.log(error.message);
    //GenResp2Caller(res, 101, {error:error.message});
  });

}

//======================================================utilities========================================
