import { AuditLogListener } from './audit-log.listener';
import { ChannelLogListener } from './channel-log.listener';
import { MemberLogListener } from './member-log.listener';
import { MessageLogListener } from './message-log.listener';
import { ServerLogListener } from './server-log.listener';
import { VoiceLogListener } from './voice-log.listener';

// ตัวดักจับเหตุการณ์ Discord ของ Log Manager (ทุกตัวส่งต่อให้ LogDispatcher — เปิด/ปิด เลือกห้อง เลือกสี ได้จากหน้า Log Management)
export const LOG_LISTENERS = [AuditLogListener, MemberLogListener, MessageLogListener, ChannelLogListener, ServerLogListener, VoiceLogListener];
