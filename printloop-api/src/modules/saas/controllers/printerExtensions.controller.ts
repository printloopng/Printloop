export {
  KioskPrinterExtensionsController,
  kioskPrinterExtensionsController,
} from '@/modules/kiosk/controllers/printerExtensions.controller';

import { kioskPrinterExtensionsController } from '@/modules/kiosk/controllers/printerExtensions.controller';

export const heartbeat = kioskPrinterExtensionsController.heartbeat;
export const updateProgress = kioskPrinterExtensionsController.updateProgress;
export const validateCode = kioskPrinterExtensionsController.validateCode;
export const getJob = kioskPrinterExtensionsController.getJob;
