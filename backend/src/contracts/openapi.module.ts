import { Controller, Get, Module } from '@nestjs/common';
import { Public } from '../core/public.decorator';
import { corePublicOperations } from '../features/core-public-operations';
import { intelligencePublicOperations } from '../features/intelligence-public-operations';
import { buildOpenApi } from './openapi';

@Controller('openapi.json')
class OpenApiController {
  @Public()
  @Get()
  getSpecification() {
    return buildOpenApi([...corePublicOperations, ...intelligencePublicOperations]);
  }
}

@Module({ controllers: [OpenApiController] })
export class OpenApiModule {}
