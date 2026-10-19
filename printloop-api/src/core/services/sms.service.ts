import axios from 'axios';

export class SMSService {
  private apiKey: string;
  private senderId: string;
  private baseUrl: string;

  constructor() {
    this.apiKey = process.env.TERMII_API_KEY || '';
    this.senderId = process.env.TERMII_SENDER_ID || 'PrintLoop';
    this.baseUrl = 'https://api.ng.termii.com/api';
  }

  
  async send(phoneNumber: string, message: string): Promise<boolean> {
    if (!this.apiKey) {
      console.warn('SMS service: TERMII_API_KEY not configured');
      return false;
    }

    try {
      const normalizedPhone = this.normalizePhone(phoneNumber);

      const response = await axios.post(`${this.baseUrl}/sms/send`, {
        to: normalizedPhone,
        from: this.senderId,
        sms: message,
        type: 'plain',
        channel: 'generic',
        api_key: this.apiKey,
      });

      return response.data.message_id !== undefined;
    } catch (error: any) {
      console.error('SMS send error:', error.response?.data || error.message);
      return false;
    }
  }

  
  async sendPrintJobCode(data: {
    phoneNumber: string;
    jobCode: string;
    fileName: string;
    cost: number;
  }): Promise<boolean> {
    const message = `PrintLoop: Your print code is ${data.jobCode}. File: ${data.fileName}. Total: NGN${data.cost}. Show this code at any PrintLoop kiosk.`;
    return this.send(data.phoneNumber, message);
  }

  
  async sendOTP(phoneNumber: string, otp: string): Promise<boolean> {
    const message = `Your PrintLoop verification code is: ${otp}. Valid for 10 minutes.`;
    return this.send(phoneNumber, message);
  }

  
  async sendGroupDeadlineReminder(data: {
    phoneNumber: string;
    groupName: string;
    hoursLeft: number;
  }): Promise<boolean> {
    const message = `PrintLoop reminder: Your group print "${data.groupName}" closes in ${data.hoursLeft} hour(s). Upload now to be included.`;
    return this.send(data.phoneNumber, message);
  }

  
  private normalizePhone(phone: string): string {
    let cleaned = phone.replace(/\D/g, '');

    if (cleaned.startsWith('0') && cleaned.length === 11) {
      cleaned = '234' + cleaned.substring(1);
    }

    if (cleaned.startsWith('+')) {
      cleaned = cleaned.substring(1);
    }

    return cleaned;
  }
}
