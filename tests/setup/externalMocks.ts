import { vi } from "vitest";


export type TelnyxSend = { to: string; from: string; text: string };
export type WhatsappSend = { to: string; template?: string; params?: unknown };
export type EmailSend = { to: string; subject: string; html: string };
export type CloudinaryUpload = { folder: string };

export type TemplateListCall = { businessAccountId: string; name: string };

type Sinks = {
  telnyx: TelnyxSend[];
  whatsapp: WhatsappSend[];
  email: EmailSend[];
  qstash: Array<Record<string, unknown>>;
  cloudinary: CloudinaryUpload[];
  templateListCalls: TemplateListCall[];
};

type Behavior = {
  whatsappSendError: string | null;
  whatsappSendResult: unknown;
  templateListError: string | null;
  templateListData: unknown[];
  cloudinaryUploadError: string | null;
  qstashPublishError: string | null;
  telnyxSendError: string | null;
  emailSendError: string | null;
  emailSendErrorOnce: string | null;
  emailAccepted: string[] | null;
  emailRejected: string[] | null;
};

const SINK_KEY = "__seatpingTestSinks";
const BEHAVIOR_KEY = "__seatpingTestBehavior";

function defaultBehavior(): Behavior {
  return {
    whatsappSendError: null,
    whatsappSendResult: null,
    templateListError: null,
    templateListData: [],
    cloudinaryUploadError: null,
    qstashPublishError: null,
    telnyxSendError: null,
    emailSendError: null,
    emailSendErrorOnce: null,
    emailAccepted: null,
    emailRejected: null,
  };
}

export function sinks(): Sinks {
  const holder = globalThis as unknown as Record<string, Sinks | undefined>;
  if (!holder[SINK_KEY]) {
    holder[SINK_KEY] = {
      telnyx: [],
      whatsapp: [],
      email: [],
      qstash: [],
      cloudinary: [],
      templateListCalls: [],
    };
  }
  return holder[SINK_KEY] as Sinks;
}

export function behavior(): Behavior {
  const holder = globalThis as unknown as Record<string, Behavior | undefined>;
  if (!holder[BEHAVIOR_KEY]) {
    holder[BEHAVIOR_KEY] = defaultBehavior();
  }
  return holder[BEHAVIOR_KEY] as Behavior;
}

export function resetExternalMocks(): void {
  const s = sinks();
  s.telnyx.length = 0;
  s.whatsapp.length = 0;
  s.email.length = 0;
  s.qstash.length = 0;
  s.cloudinary.length = 0;
  s.templateListCalls.length = 0;
  Object.assign(behavior(), defaultBehavior());
}

vi.mock("telnyx", () => {
  class FakeTelnyx {
    public messages = {
      send: async (payload: TelnyxSend) => {
        const store = sinks().telnyx;
        store.push(payload);
        if (behavior().telnyxSendError) {
          throw new Error(behavior().telnyxSendError as string);
        }
        return { data: { id: `test-sms-${store.length}` } };
      },
    };
  }
  return { default: FakeTelnyx, Telnyx: FakeTelnyx };
});

vi.mock("@kapso/whatsapp-cloud-api", () => {
  class FakeWhatsApp {
    public messages = {
      sendTemplate: async (payload: WhatsappSend) => {
        const store = sinks().whatsapp;
        store.push(payload);
        const b = behavior();
        if (b.whatsappSendError) {
          throw new Error(b.whatsappSendError);
        }
        if (b.whatsappSendResult !== null) {
          return b.whatsappSendResult;
        }
        return { messages: [{ id: `test-wa-${store.length}` }] };
      },
      send: async (payload: WhatsappSend) => {
        const store = sinks().whatsapp;
        store.push(payload);
        return { messages: [{ id: `test-wa-${store.length}` }] };
      },
    };

    public templates = {
      list: async (payload: TemplateListCall) => {
        sinks().templateListCalls.push(payload);
        const b = behavior();
        if (b.templateListError) {
          throw new Error(b.templateListError);
        }
        return { data: b.templateListData };
      },
    };
  }
  return {
    default: FakeWhatsApp,
    WhatsAppClient: FakeWhatsApp,
    WhatsAppCloudAPI: FakeWhatsApp,
  };
});

vi.mock("nodemailer", () => {
  const transport = {
    sendMail: async (payload: EmailSend) => {
      const store = sinks().email;
      store.push(payload);
      const b = behavior();
      if (b.emailSendErrorOnce) {
        const message = b.emailSendErrorOnce;
        b.emailSendErrorOnce = null;
        throw new Error(message);
      }
      if (b.emailSendError) {
        throw new Error(b.emailSendError);
      }
      return {
        accepted: b.emailAccepted ?? [payload.to],
        rejected: b.emailRejected ?? [],
        messageId: `test-email-${store.length}`,
      };
    },
    verify: async () => {
      return true;
    },
  };
  return {
    default: { createTransport: () => transport },
    createTransport: () => transport,
  };
});

vi.mock("@upstash/qstash", () => {
  class FakeClient {
    public async publishJSON(payload: Record<string, unknown>) {
      const store = sinks().qstash;
      store.push(payload);
      if (behavior().qstashPublishError) {
        throw new Error(behavior().qstashPublishError as string);
      }
      return { messageId: `test-qstash-${store.length}` };
    }
  }
  class FakeReceiver {
    public async verify() {
      return true;
    }
  }
  return { Client: FakeClient, Receiver: FakeReceiver };
});

vi.mock("cloudinary", () => {
  const uploader = {
    upload_stream: (
      options: { folder?: string },
      callback: (err: unknown, result: unknown) => void,
    ) => {
      const store = sinks().cloudinary;
      store.push({ folder: options?.folder ?? "" });
      return {
        end: () => {
          const failure = behavior().cloudinaryUploadError;
          if (failure) {
            callback(new Error(failure), null);
            return;
          }
          callback(null, {
            secure_url: "https://test.invalid/image.jpg",
            public_id: `test-upload-${store.length}`,
          });
        },
      };
    },
    destroy: async () => {
      return { result: "ok" };
    },
  };
  const config = () => {
    return {};
  };
  const utils = {
    api_sign_request: (params: Record<string, unknown>, secret: string) => {
      return `sig-${Object.keys(params).sort().join(".")}-${secret.length}`;
    },
  };
  return {
    v2: { config, uploader, utils },
    default: { v2: { config, uploader, utils } },
  };
});
