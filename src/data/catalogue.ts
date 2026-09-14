import { loadCatalogue } from '../domain/catalogue.ts'
import { seedRows } from './catalogue.seed.ts'

export const catalogue = loadCatalogue(seedRows)
