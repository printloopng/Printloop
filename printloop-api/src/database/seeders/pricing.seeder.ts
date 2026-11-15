import { DataSource } from "typeorm";
import { PricingConfig, PaperSize, ColorType } from "@/database/entities/pricingConfig.entity";
import { Tenant } from "@/database/entities/tenant.entity";

export class PricingSeeder {
  public async run(dataSource: DataSource, shop: Tenant): Promise<PricingConfig[]> {
    const repo = dataSource.getRepository(PricingConfig);

    return repo.save([
      repo.create({
        tenantId: shop.id,
        paperSize: PaperSize.A4,
        colorType: ColorType.BLACK_WHITE,
        pricePerPage: 70,
        duplexMultiplier: 1.0,
        highResolutionMultiplier: 1.0,
        price100Simplex: 50,
        price300Simplex: 70,
        price600Simplex: 100,
        price100Duplex: 65,
        price300Duplex: 90,
        price600Duplex: 120
      }),
      repo.create({
        tenantId: shop.id,
        paperSize: PaperSize.A4,
        colorType: ColorType.COLOR,
        pricePerPage: 200,
        duplexMultiplier: 1.0,
        highResolutionMultiplier: 1.0,
        price100Simplex: 100,
        price300Simplex: 200,
        price600Simplex: 300,
        price100Duplex: 150,
        price300Duplex: 250,
        price600Duplex: 350
      }),
      repo.create({
        tenantId: shop.id,
        paperSize: PaperSize.A3,
        colorType: ColorType.BLACK_WHITE,
        pricePerPage: 150,
        duplexMultiplier: 1.0,
        highResolutionMultiplier: 1.0,
        price100Simplex: 100,
        price300Simplex: 150,
        price600Simplex: 300,
        price100Duplex: 150,
        price300Duplex: 230,
        price600Duplex: 400
      }),
      repo.create({
        tenantId: shop.id,
        paperSize: PaperSize.A3,
        colorType: ColorType.COLOR,
        pricePerPage: 400,
        duplexMultiplier: 1.0,
        highResolutionMultiplier: 1.0,
        price100Simplex: 250,
        price300Simplex: 400,
        price600Simplex: 650,
        price100Duplex: 390,
        price300Duplex: 400,
        price600Duplex: 650
      })
    ]);
  }
}
