import { Module } from '@nestjs/common';

import { FilesController } from './files.controller';
import { FilesService } from './files.service';
import { UploadLimitsController } from './upload-limits.controller';

@Module({
  controllers: [FilesController, UploadLimitsController],
  providers: [FilesService],
  exports: [FilesService],
})
export class FilesModule {}
