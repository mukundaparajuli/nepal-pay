import { mockConformanceDriver } from './drivers/mock.driver.js'
import { runGatewayConformanceSuite } from './suite.js'

runGatewayConformanceSuite(mockConformanceDriver)
