import { connectIpsConformanceDriver } from './drivers/connectips.driver.js'
import { runGatewayConformanceSuite } from './suite.js'

runGatewayConformanceSuite(connectIpsConformanceDriver)
