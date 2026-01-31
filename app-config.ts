import type { AppConfig } from './lib/types';

export const APP_CONFIG_DEFAULTS: AppConfig = {
  companyName: '榆林市医疗保障局',
  pageTitle: '榆林医保智能客服',
  pageDescription: '面向市民的医保智能 AI 客服，支持语音与文字咨询',

  supportsChatInput: true,
  supportsAudioInput: true,
  supportsVideoInput: true,
  supportsScreenShare: true,
  isPreConnectBufferEnabled: true,

  logo: '/yulin-mhsa-logo.svg',
  accent: '#d10000',
  logoDark: '/yulin-mhsa-logo-dark.svg',
  accentDark: '#ff5a52',
  startButtonText: '开始咨询',
};
