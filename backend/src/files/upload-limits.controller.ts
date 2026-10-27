import { Controller, Get } from '@nestjs/common';

import { publicUploadLimits } from './upload-limits';

/**
 * The upload rules on their own, before a job exists. The upload screen needs them to
 * tell a visitor what each slot accepts, and a draft job is deliberately not created
 * until the first file arrives — so the rules cannot ride along on that response.
 */
@Controller('upload-limits')
export class UploadLimitsController {
  @Get()
  limits() {
    return publicUploadLimits();
  }
}
