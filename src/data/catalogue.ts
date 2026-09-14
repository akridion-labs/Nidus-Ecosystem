import { loadCatalogue } from '../domain/catalogue.ts'
import { seedWorks, seedEditions, seedProfiles } from './catalogue.seed.ts'

export const catalogue = loadCatalogue(seedWorks, seedEditions, seedProfiles)
