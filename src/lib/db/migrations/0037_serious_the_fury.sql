ALTER TABLE "app_settings" ALTER COLUMN "vat_rate_percent" SET DEFAULT '0.00';--> statement-breakpoint

-- Owner instruction: 'no VAT for now'. Reset every existing app_settings row
-- so new invoices from now on skip VAT. Historical invoices are unaffected —
-- their tax_amount is captured on the row and stays truthful to what was
-- charged at that moment. To bring VAT back later, edit the rate in
-- /admin/settings; the invoice/receipt templates re-render the VAT row
-- automatically once the rate is > 0.
UPDATE "app_settings" SET "vat_rate_percent" = '0.00';
