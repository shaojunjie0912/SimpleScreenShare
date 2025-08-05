"use strict";

const local_video = document.getElementById("localVideo");
const remote_video = document.getElementById("remoteVideo");

const start_push_btn = document.getElementById("btnStartPush");
const stop_push_btn = document.getElementById("btnStopPush");
const start_pull_btn = document.getElementById("btnStartPull");
const stop_pull_btn = document.getElementById("btnStopPull");

start_push_btn.addEventListener("click", StartPush);
stop_push_btn.addEventListener("click", StopPush);
start_pull_btn.addEventListener("click", StartPull);
stop_pull_btn.addEventListener("click", StopPull);

let local_stream = null;
let remote_stream = null;

const config = {}; // 使用默认配置

// 推流端
const offer_option = {
    offerToReceiveAudio: false, // 不接收音频
    offerToReceiveVideo: false, // 不接收视频
};

let pc1 = new RTCPeerConnection(config); // local pc
let pc2 = new RTCPeerConnection(config); // remote pc

async function StartPush() {
    console.log("开始请求屏幕共享...");

    // 检查浏览器是否支持 getDisplayMedia
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
        alert("你的浏览器不支持屏幕共享 API，请更新或更换浏览器。");
        return;
    }

    try {
        // 直接调用标准 API，这会触发浏览器原生的选择界面
        const stream = await navigator.mediaDevices.getDisplayMedia({
            video: {
                // 推荐设置光标为 "always" 或 "motion"，体验更好
                cursor: "always",
            },
            audio: false, // 如果不需要采集系统声音，设为 false
        });

        console.log("用户同意屏幕共享，获取媒体流成功！");
        local_stream = stream; // 保存流对象，以便后续停止
        local_video.srcObject = stream; // HACK: 直接将流设置给 video 标签播放

        pc1.addStream(stream); // 将屏幕共享流添加到 pc1
        pc1.createOffer(offer_option).then(
            OnCreateOfferSuccess,
            OnCreateSessionDescrptionError
        );

        pc1.onicecandidate = (e) => {
            OnIceCandidate(pc1, e);
        };
        pc1.oniceconnectionstatechange = (e) => {
            OnIceStateChange(pc1, e);
        };

        // 监听用户通过浏览器原生UI停止共享的事件
        const video_track = stream.getVideoTracks()[0];
        video_track.onended = () => {
            console.log("用户通过浏览器UI停止了共享");
            StopPush();
        };
    } catch (error) {
        console.error("屏幕共享失败或被用户取消:", error);
    }
}

function StartPull() {
    console.log("开始拉流...");
    remote_video.srcObject = remote_stream;
    pc2.createAnswer().then(
        OnCreateAnswerSuccess,
        OnCreateSessionDescrptionError
    );
}

function StopPush() {
    console.log("pc1 停止推流");

    // 停止本地媒体流
    if (local_stream) {
        local_stream.getTracks().forEach((track) => track.stop());
        local_video.srcObject = null;
        local_stream = null;
    }

    // 关闭并重置 pc1
    if (pc1) {
        pc1.close();
        pc1 = new RTCPeerConnection(config);
    }
}

function StopPull() {
    console.log("pc2 停止拉流");
    // 1. 关闭远端对等连接 (pc2)
    if (pc2) {
        pc2.close();
        pc2 = new RTCPeerConnection(config); // 重新初始化，以便可以再次拉流
    }

    // 2. 清空 remote_video 元素的视频源
    remote_video.srcObject = null;
}

function GetPc(pc) {
    return pc === pc1 ? "pc1" : "pc2";
}

function OnIceStateChange(pc, event) {
    console.log(`ICE 状态变化: ${GetPc(pc)} - ${pc.iceConnectionState}`);
    if (
        pc.iceConnectionState === "disconnected" ||
        pc.iceConnectionState === "failed"
    ) {
        // 判断是哪个 PeerConnection 断开了
        if (pc === pc1) {
            console.log("推流连接 (pc1) 断开，停止推流。");
            StopPush();
        } else if (pc === pc2) {
            console.log("拉流连接 (pc2) 断开，停止拉流。");
            StopPull();
        }
    }
}

function GetOtherPc(pc) {
    return pc === pc1 ? pc2 : pc1;
}

function OnIceCandidate(pc, e) {
    console.log(
        `ICE 候选者: ${GetPc(pc)} - ${
            e.candidate ? e.candidate.candidate : "无候选者"
        }`
    );
    GetOtherPc(pc)
        .addIceCandidate(e.candidate)
        .then(
            function () {
                console.log(`添加 ${GetPc(GetOtherPc(pc))} 的 ICE 候选者成功`);
            },
            function (error) {
                console.error(
                    `添加 ${GetPc(GetOtherPc(pc))} 的 ICE 候选者失败:`,
                    error
                );
            }
        );
}

function OnCreateOfferSuccess(desc) {
    console.log("pc1 创建 offer 成功:\n", desc.sdp);
    console.log("pc1 设置本地描述...");
    pc1.setLocalDescription(desc).then(function () {
        OnSetLocalSuccess(pc1);
    }, OnSetSessionDescriptionError);

    // NOTE: 这里因为没有信令服务器, 因此 pc2 直接在 pc1 的 create offer 成功后设置远端描述
    // SDP 交换
    pc2.oniceconnectionstatechange = (e) => {
        OnIceStateChange(pc2, e);
    };

    pc2.onicecandidate = (e) => {
        OnIceCandidate(pc2, e);
    };

    pc2.setRemoteDescription(desc).then(function () {
        OnSetRemoteSuccess(pc2);
    }, OnSetSessionDescriptionError);

    pc2.onaddstream = (e) => {
        console.log("pc2 收到远端流, stream id: " + e.stream.id);
        // remote_video.srcObject = e.stream; // 将远端流设置给 video 标签播放
        remote_stream = e.stream;
    };
}

function OnCreateSessionDescrptionError(error) {
    console.error("创建会话描述失败:", error);
}

function OnSetSessionDescriptionError(error) {
    console.error("设置会话描述失败:", error);
}

function OnSetLocalSuccess(pc) {
    console.log(`设置 ${GetPc(pc)} 的本地描述成功`);
}

function OnSetRemoteSuccess(pc) {
    console.log(`设置 ${GetPc(pc)} 的远端描述成功`);
}

function OnCreateAnswerSuccess(desc) {
    console.log("pc2 创建 answer 成功:\n", desc.sdp);
    console.log("pc2 设置本地描述...");
    pc2.setLocalDescription(desc).then(function () {
        OnSetLocalSuccess(pc2);
    }, OnSetSessionDescriptionError);

    // NOTE: 这里因为没有信令服务器, 因此 pc1 直接在 pc2 的 create answer 成功后设置远端描述
    // 将 pc1 的 offer 设置为远端描述
    pc1.setRemoteDescription(desc).then(function () {
        OnSetRemoteSuccess(pc1);
    }, OnSetSessionDescriptionError);
}
