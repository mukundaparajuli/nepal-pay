import { fonepayConformanceDriver } from './drivers/fonepay.driver.js'
import { runGatewayConformanceSuite } from './suite.js'

runGatewayConformanceSuite(fonepayConformanceDriver)
