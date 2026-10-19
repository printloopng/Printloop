declare module "ipp";
declare module "socks";
declare module "@sentry/profiling-node" {
  export function nodeProfilingIntegration(): unknown;
}

declare global {
  type RTCIceServer = {
    urls: string | string[];
    username?: string;
    credential?: string;
  };
  type RTCSessionDescriptionInit = {
    type: "offer" | "answer" | "pranswer" | "rollback";
    sdp?: string;
  };
  type RTCIceCandidateInit = {
    candidate?: string;
    sdpMid?: string | null;
    sdpMLineIndex?: number | null;
    usernameFragment?: string | null;
  };
}

export {};
